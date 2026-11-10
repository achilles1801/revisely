// revisely.app's home: the slideshow (one idea a slide), its loops, and Revo's clip.
//
// - The slideshow moves on every 7 s. Focus inside it holds it; swiping, scrolling, a key, an arrow or
//   a dot stops it for good (the loops keep playing). The pause button stops both, and starts both again.
// - With "reduce motion" on it starts with both off and downloads no video; play starts them.
// - Pictures are <picture>s that follow the visitor's light or dark appearance by themselves. Slides
//   further on wait (loading="lazy") until they're next to the current one.
// - A loop plays only on the current slide, while the slideshow is on screen. It starts from the moment
//   its picture shows (data-t-light / data-t-dark), and is shown only once it stands there, so nothing
//   jumps. A screen can have a light and a dark loop (data-clip-light / data-clip-dark); with only
//   one, the other appearance keeps the picture.
(function () {
  var stage = document.querySelector('.show');
  if (!stage) return;

  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var track = stage.querySelector('.show-track');
  var slides = [].slice.call(track.querySelectorAll('.slide'));
  var dotsBox = stage.querySelector('.dots');
  var prev = stage.querySelector('.prev');
  var next = stage.querySelector('.next');
  var toggle = stage.querySelector('.toggle');
  var SLIDE_MS = 7000;

  var current = -1;
  var timer = 0;
  var held = false;       // focus is inside the slideshow
  var inView = true;      // the slideshow is on screen
  var target = -1;        // a slide this script is scrolling to
  var targetTimer = 0;
  // The slideshow moving on by itself, and the loops inside the phones.
  var advancing = !mqReduce.matches;
  var motion = !mqReduce.matches;

  function listen(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }
  function scheme() { return mqDark.matches ? 'dark' : 'light'; }

  // ---------- Pictures ----------

  function wake(i) {
    if (i < 0 || i >= slides.length) return;
    [].forEach.call(slides[i].querySelectorAll('img[loading="lazy"]'), function (img) {
      img.setAttribute('loading', 'eager');
    });
  }

  // ---------- Loops ----------

  function clipFor(screen) {
    var s = scheme();
    var src = screen.getAttribute('data-clip-' + s);
    return src ? { src: src, t: parseFloat(screen.getAttribute('data-t-' + s)) || 0 } : null;
  }

  function stopClip(screen) {
    var v = screen.querySelector('video');
    if (v && !v.paused) v.pause();
  }

  // Forget a loop's sources (after a switch between light and dark, or to start afresh).
  function resetClip(screen) {
    var v = screen.querySelector('video');
    if (!v) return;
    v.pause();
    screen.classList.remove('is-playing');
    v.revGen = (v.revGen || 0) + 1; // what startAt was waiting for no longer counts
    if (!v.hasAttribute('data-src')) return;
    v.removeAttribute('data-src');
    while (v.firstChild) v.removeChild(v.firstChild);
    v.removeAttribute('src');
    v.load();
  }

  function playClip(screen) {
    var v = screen.querySelector('video');
    if (!v) return;
    var c = clipFor(screen);
    if (!c) { resetClip(screen); return; }
    if (v.getAttribute('data-src') !== c.src) {
      resetClip(screen);
      v.setAttribute('data-src', c.src);
      [['webm', 'video/webm; codecs=vp9'], ['mp4', 'video/mp4']].forEach(function (f) {
        var el = document.createElement('source');
        el.src = c.src + '.' + f[0];
        el.type = f[1];
        v.appendChild(el);
      });
      startAt(v, screen, c.t);
      v.load();
    }
    var p = v.play();
    // Refused (Low Power Mode, for one): the picture stays.
    if (p && p.catch) p.catch(function () {});
  }

  // Start from the picture's moment, and show the video only once it is there. The seek waits until
  // that part of the clip has arrived.
  function startAt(v, screen, t) {
    var gen = v.revGen = (v.revGen || 0) + 1;
    var shown = false;
    var seeking = false;
    var events = ['loadedmetadata', 'progress', 'canplaythrough'];
    function show() {
      if (shown || v.revGen !== gen) return;
      shown = true;
      screen.classList.add('is-playing');
    }
    if (!t) { v.addEventListener('playing', show, { once: true }); return; }
    function covers(r) {
      for (var i = 0; i < r.length; i++) if (r.start(i) <= t && r.end(i) >= t) return true;
      return false;
    }
    function trySeek() {
      if (v.revGen !== gen) {
        events.forEach(function (n) { v.removeEventListener(n, trySeek); });
        return;
      }
      if (seeking || !v.duration) return;
      if (!covers(v.seekable) && !covers(v.buffered) && v.readyState < 4) return;
      seeking = true;
      events.forEach(function (n) { v.removeEventListener(n, trySeek); });
      v.addEventListener('seeked', show, { once: true });
      try { v.currentTime = Math.min(t, v.duration - 0.1); } catch (e) { show(); }
    }
    events.forEach(function (n) { v.addEventListener(n, trySeek); });
  }

  function syncClips() {
    var run = motion && inView && !document.hidden;
    slides.forEach(function (sl, i) {
      [].forEach.call(sl.querySelectorAll('.screen'), function (screen) {
        if (i === current && run) playClip(screen);
        else stopClip(screen);
      });
    });
  }

  // ---------- Dots ----------

  slides.forEach(function (sl, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dot';
    b.setAttribute('aria-label', 'Slide ' + (i + 1) + ': ' + sl.getAttribute('data-name'));
    b.appendChild(document.createElement('i'));
    b.addEventListener('click', function () { userMoved(); go(i); });
    dotsBox.appendChild(b);
  });
  var dots = [].slice.call(dotsBox.children);

  // The current dot fills over the 7 s; start it again from empty.
  function restartBar() {
    var d = dots[current];
    if (!d) return;
    var bar = d.querySelector('i');
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
  }

  // ---------- Moving between slides ----------

  function setEnd(btn, atEnd) {
    if (atEnd) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  }

  function setCurrent(i) {
    if (i === current) return;
    current = i;
    slides.forEach(function (sl, j) { sl.classList.toggle('is-active', j === i); });
    dots.forEach(function (d, j) {
      if (j === i) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
    restartBar();
    setEnd(prev, i === 0);
    setEnd(next, i === slides.length - 1);
    wake(i); wake(i - 1); wake(i + 1);
    syncClips();
    schedule();
  }

  function go(i, instant) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    target = i;
    clearTimeout(targetTimer);
    targetTimer = setTimeout(function () { target = -1; }, 1200);
    var left = i * track.clientWidth;
    var smooth = !instant && !mqReduce.matches;
    if (track.scrollTo) track.scrollTo({ left: left, behavior: smooth ? 'smooth' : 'auto' });
    else track.scrollLeft = left;
    setCurrent(i);
  }

  // Which slide shows after a swipe, a trackpad or a scroll. A scroll this script started is left
  // alone until it lands.
  var raf = 0;
  track.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (target >= 0) {
        if (Math.abs(track.scrollLeft - target * track.clientWidth) < 2) target = -1;
        return;
      }
      setCurrent(Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth))));
    });
  }, { passive: true });

  window.addEventListener('resize', function () {
    target = current;
    track.scrollLeft = current * track.clientWidth;
  });

  // ---------- Moving on by itself ----------

  function schedule() {
    clearTimeout(timer);
    stage.classList.toggle('advancing', advancing);
    stage.classList.toggle('held', held || !inView);
    stage.classList.toggle('still', !motion);
    stage.classList.toggle('stopped', !motion && !advancing);
    toggle.setAttribute('aria-label', motion || advancing ? 'Pause the slideshow' : 'Play the slideshow');
    if (!advancing || held || !inView || document.hidden) return;
    timer = setTimeout(advanceNow, SLIDE_MS);
  }

  // After the last slide it fades back to the first rather than scrolling back through them all.
  function advanceNow() {
    if (current < slides.length - 1) { go(current + 1); return; }
    if (mqReduce.matches) { go(0, true); return; }
    track.classList.add('fading');
    setTimeout(function () { go(0, true); track.classList.remove('fading'); }, 260);
  }

  function userMoved() {
    target = -1;
    if (advancing) { advancing = false; schedule(); }
  }

  function hold(on) {
    if (held === on) return;
    held = on;
    if (!on) restartBar();
    schedule();
  }

  prev.addEventListener('click', function () {
    if (prev.hasAttribute('aria-disabled')) return;
    userMoved(); go(current - 1);
  });
  next.addEventListener('click', function () {
    if (next.hasAttribute('aria-disabled')) return;
    userMoved(); go(current + 1);
  });
  toggle.addEventListener('click', function () {
    var on = !(motion || advancing);
    motion = on;
    advancing = on;
    restartBar();
    syncClips();
    schedule();
  });
  track.addEventListener('pointerdown', userMoved);
  track.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) userMoved();
  }, { passive: true });
  track.addEventListener('keydown', function (e) {
    var to = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: slides.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    userMoved();
    go(to);
  });
  stage.addEventListener('focusin', function (e) { if (e.target !== toggle) hold(true); });
  stage.addEventListener('focusout', function (e) { if (!stage.contains(e.relatedTarget)) hold(false); });

  // ---------- Revo's clip: plays while on screen, with its own button ----------

  var revoScreen = document.getElementById('revo-screen');
  var revoBtn = document.querySelector('.revo .clip-toggle');
  var revoOn = !mqReduce.matches;
  var revoVisible = false;

  function revoSync() {
    if (!revoScreen) return;
    revoBtn.setAttribute('data-playing', String(revoOn));
    revoBtn.setAttribute('aria-label', revoOn ? 'Pause Revo’s introduction' : 'Play Revo’s introduction');
    if (revoOn && revoVisible && !document.hidden) playClip(revoScreen);
    else stopClip(revoScreen);
  }
  if (revoScreen) {
    revoBtn.addEventListener('click', function () { revoOn = !revoOn; revoSync(); });
  }

  // ---------- On screen or not ----------

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      syncClips();
      schedule();
    }, { threshold: 0.4 }).observe(stage);
    if (revoScreen) {
      new IntersectionObserver(function (entries) {
        revoVisible = entries[0].isIntersecting;
        revoSync();
      }, { threshold: 0.35 }).observe(revoScreen);
    }
  } else {
    revoVisible = true;
  }

  document.addEventListener('visibilitychange', function () { syncClips(); schedule(); revoSync(); });

  // Light to dark or back: the pictures switch by themselves; the loops start again in the other take.
  listen(mqDark, function () {
    slides.forEach(function (sl) { [].forEach.call(sl.querySelectorAll('.screen'), resetClip); });
    if (revoScreen) resetClip(revoScreen);
    syncClips();
    revoSync();
  });
  listen(mqReduce, function () {
    if (!mqReduce.matches) return;
    motion = false;
    advancing = false;
    revoOn = false;
    syncClips();
    schedule();
    revoSync();
  });

  // ---------- Start: the first slide, then its cards fan out ----------

  stage.classList.add('is-live');
  setCurrent(0);
  revoSync();
  var pitch = slides[0];
  if (mqReduce.matches) pitch.classList.add('fanned');
  else requestAnimationFrame(function () { setTimeout(function () { pitch.classList.add('fanned'); }, 250); });
})();
