(() => {
  'use strict';

  const proto = HTMLMediaElement.prototype;
  const native = Object.getOwnPropertyDescriptor(proto, 'volume');

  const RAMP_STEPS = 15;
  const RAMP_STEP_MS = 20;
  const MAX_BOOST_LIMIT_DB = 24;

  const settings = { enabled: true, maxBoostDb: 12 };
  let settingsReceived = false;
  const states = new WeakMap();

  function player() {
    return document.getElementById('movie_player');
  }

  function stateOf(el) {
    let state = states.get(el);
    if (!state) {
      const volume = native.get.call(el);
      state = { requested: volume, written: volume, gain: 1, target: 1, timer: 0 };
      states.set(el, state);
    }
    return state;
  }

  function trackInfo(el) {
    const root = player();
    if (!root || !root.contains(el) || typeof root.getPlayerResponse !== 'function') return null;
    const response = root.getPlayerResponse();
    if (!response || !response.videoDetails || !response.playerConfig) return null;
    const audio = response.playerConfig.audioConfig;
    const loudnessDb = audio && audio.loudnessDb;
    if (typeof loudnessDb !== 'number' || !Number.isFinite(loudnessDb)) return null;
    const title = String(response.videoDetails.title || '');
    let artist = String(response.videoDetails.author || '').replace(/ - Topic$/, '');
    const meta = navigator.mediaSession && navigator.mediaSession.metadata;
    if (meta && meta.title === title && meta.artist) artist = meta.artist;
    return { loudnessDb, title, artist };
  }

  function targetGain(el) {
    if (!settings.enabled || !settingsReceived) return 1;
    const info = trackInfo(el);
    if (!info) return 1;
    const boostDb = Math.min(settings.maxBoostDb, -info.loudnessDb);
    return boostDb > 0 ? 10 ** (boostDb / 20) : 1;
  }

  function isAudible(el) {
    return !el.paused && !el.ended && !el.muted && el.readyState > 2 && el.currentTime > 0.25;
  }

  function write(el, state) {
    const real = Math.min(1, state.requested * state.gain);
    state.written = real;
    if (native.get.call(el) !== real) native.set.call(el, real);
  }

  function stopRamp(state) {
    clearInterval(state.timer);
    state.timer = 0;
  }

  function update(el) {
    const state = stateOf(el);
    const target = targetGain(el);
    if (target !== state.target) {
      state.target = target;
      stopRamp(state);
      if (isAudible(el)) {
        const ratio = (target / state.gain) ** (1 / RAMP_STEPS);
        let left = RAMP_STEPS;
        state.timer = setInterval(() => {
          left--;
          state.gain = left > 0 ? state.gain * ratio : target;
          if (left <= 0) stopRamp(state);
          write(el, state);
          announce(el);
        }, RAMP_STEP_MS);
      } else {
        state.gain = target;
      }
    }
    write(el, state);
    announce(el);
  }

  function managed(el) {
    if (states.has(el)) return true;
    const root = player();
    return !!root && root.contains(el);
  }

  Object.defineProperty(proto, 'volume', {
    configurable: true,
    enumerable: native.enumerable,
    get() {
      const state = states.get(this);
      return state ? state.requested : native.get.call(this);
    },
    set(value) {
      if (typeof value === 'number' && value >= 0 && value <= 1 && this instanceof HTMLMediaElement) {
        try {
          if (managed(this)) {
            const state = stateOf(this);
            const changed = state.requested !== value;
            const before = native.get.call(this);
            state.requested = value;
            update(this);
            // The real volume did not change, so the browser fires no volumechange for the page.
            if (changed && native.get.call(this) === before) {
              setTimeout(() => this.dispatchEvent(new Event('volumechange')), 0);
            }
            return;
          }
        } catch {
          states.delete(this);
        }
      }
      native.set.call(this, value);
    },
  });

  function onMediaEvent(event) {
    const el = event.target;
    if (!(el instanceof HTMLMediaElement) || !managed(el)) return;
    try {
      update(el);
    } catch {}
  }

  for (const type of ['emptied', 'loadstart', 'durationchange', 'loadedmetadata', 'playing', 'timeupdate']) {
    document.addEventListener(type, onMediaEvent, true);
  }

  document.addEventListener('volumechange', (event) => {
    const el = event.target;
    const state = states.get(el);
    if (!state) return;
    const real = native.get.call(el);
    if (real === state.written) return;
    // Something outside this script set the volume: take it as the page's value.
    state.requested = real;
    try {
      update(el);
    } catch {}
  }, true);

  function playerElement() {
    const root = player();
    return root ? root.querySelector('video, audio') : null;
  }

  function status() {
    const result = { enabled: settings.enabled, track: false };
    const el = playerElement();
    const info = el && trackInfo(el);
    if (!info) return result;
    const state = stateOf(el);
    result.track = true;
    result.title = info.title;
    result.artist = info.artist;
    result.targetDb = 20 * Math.log10(state.target);
    result.appliedDb = 20 * Math.log10(Math.min(state.gain, 1 / state.requested));
    return result;
  }

  let announced = '';

  function announce(el) {
    try {
      if (el !== playerElement()) return;
      const detail = JSON.stringify(status());
      if (detail === announced) return;
      announced = detail;
      document.dispatchEvent(new CustomEvent('ytm-songboost:changed', { detail }));
    } catch {}
  }

  document.addEventListener('ytm-songboost:settings', (event) => {
    try {
      const incoming = JSON.parse(event.detail);
      const max = Number(incoming.maxBoostDb);
      settings.enabled = incoming.enabled !== false;
      if (Number.isFinite(max)) settings.maxBoostDb = Math.min(MAX_BOOST_LIMIT_DB, Math.max(0, max));
      settingsReceived = true;
      const el = playerElement();
      if (el) update(el);
    } catch {}
  });

  document.addEventListener('ytm-songboost:query', () => {
    let detail = 'null';
    try {
      detail = JSON.stringify(status());
    } catch {}
    document.dispatchEvent(new CustomEvent('ytm-songboost:status', { detail }));
  });

  document.dispatchEvent(new CustomEvent('ytm-songboost:ready'));
})();
