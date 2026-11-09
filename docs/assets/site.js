// Clips: load and play only while on screen; each has a pause button.
// With "reduce motion" on, nothing plays until the visitor presses play.
// A clip whose sources have data-src and data-src-dark (and a poster in data-poster-dark) has a
// light and a dark take: it plays the one that matches the visitor's appearance.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  var frames = Array.prototype.slice.call(document.querySelectorAll('[data-clip-frame]'));

  // The light or dark take of an attribute (data-src, data-poster), if the element has both.
  function pick(el, name) {
    var d = el.getAttribute('data-' + name + '-dark');
    return d && dark.matches ? d : el.getAttribute('data-' + name);
  }

  // Points a two-take clip at the take for the current appearance. False for a one-take clip.
  // The sources are inserted afresh rather than given a src: a new source is what a waiting video
  // picks up by itself, while load() would make Chrome download the clip despite preload="none".
  function setSources(video) {
    var sources = video.querySelectorAll('source[data-src]');
    if (!sources.length) return false;
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i].cloneNode(false);
      s.src = pick(sources[i], 'src');
      video.replaceChild(s, sources[i]);
    }
    return true;
  }

  function setButton(btn, playing) {
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip');
  }

  function loadPoster(video) {
    var p = pick(video, 'poster');
    if (p) { video.poster = p; video.setAttribute('data-poster-shown', ''); }
  }

  function play(state) {
    // After a switch between light and dark, the video still holds the old take until reloaded.
    if (state.reload) { state.reload = false; state.video.load(); }
    var p = state.video.play();
    if (p && p.catch) {
      // Autoplay refused (e.g. Low Power Mode): show the play button instead.
      p.catch(function () { setButton(state.btn, false); });
    }
    setButton(state.btn, true);
  }

  function pause(state) {
    state.video.pause();
    setButton(state.btn, false);
  }

  var states = frames.map(function (frame) {
    var state = {
      video: frame.querySelector('video'),
      btn: frame.querySelector('.clip-toggle'),
      visible: false,
      // The visitor's own choice wins over scrolling and the motion setting.
      userPaused: false,
      userPlayed: false,
    };
    state.themed = setSources(state.video);
    setButton(state.btn, false);
    state.btn.addEventListener('click', function () {
      if (state.video.paused) {
        state.userPaused = false;
        state.userPlayed = true;
        play(state);
      } else {
        state.userPaused = true;
        state.userPlayed = false;
        pause(state);
      }
    });
    return state;
  });

  function shouldPlay(state) {
    if (!state.visible || state.userPaused) return false;
    return state.userPlayed || !reduce.matches;
  }

  function update(state) {
    if (shouldPlay(state)) {
      if (state.video.paused) play(state);
    } else if (!state.video.paused) {
      state.video.pause();
      setButton(state.btn, false);
    }
  }

  if (!('IntersectionObserver' in window)) {
    states.forEach(function (s) { loadPoster(s.video); s.visible = true; update(s); });
  } else {
    // Posters a screen ahead; playback only when a good part is in view.
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { loadPoster(e.target); near.unobserve(e.target); }
      });
    }, { rootMargin: '800px 0px' });

    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var state = states.filter(function (s) { return s.video === e.target; })[0];
        if (!state) return;
        state.visible = e.isIntersecting;
        update(state);
      });
    }, { threshold: 0.35 });

    states.forEach(function (s) { near.observe(s.video); seen.observe(s.video); });
  }

  function onMotionChange() { states.forEach(update); }
  if (reduce.addEventListener) reduce.addEventListener('change', onMotionChange);
  else if (reduce.addListener) reduce.addListener(onMotionChange);

  // Light to dark or back: switch two-take clips to the other take (from the start, when it plays).
  function onSchemeChange() {
    states.forEach(function (s) {
      if (!s.themed) return;
      setSources(s.video);
      if (s.video.hasAttribute('data-poster-shown')) loadPoster(s.video);
      s.reload = true;
      if (!s.video.paused) play(s);
    });
  }
  if (dark.addEventListener) dark.addEventListener('change', onSchemeChange);
  else if (dark.addListener) dark.addListener(onSchemeChange);

  document.addEventListener('visibilitychange', function () {
    states.forEach(function (s) {
      if (document.hidden) s.video.pause();
      else update(s);
    });
  });
})();
