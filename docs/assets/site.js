// Clips: load and play only while on screen; each has a pause button.
// With "reduce motion" on, nothing plays until the visitor presses play.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var frames = Array.prototype.slice.call(document.querySelectorAll('[data-clip-frame]'));

  function setButton(btn, playing) {
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btn.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip');
  }

  function loadPoster(video) {
    var p = video.getAttribute('data-poster');
    if (p) { video.poster = p; video.removeAttribute('data-poster'); }
  }

  function play(state) {
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

  document.addEventListener('visibilitychange', function () {
    states.forEach(function (s) {
      if (document.hidden) s.video.pause();
      else update(s);
    });
  });
})();
