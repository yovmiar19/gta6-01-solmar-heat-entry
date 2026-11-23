// Step 12 — the game's sound: a tiny WebAudio synth, no audio files.
// A shot is a short square pop sliding down, a punch a low sine thud, a
// finished mission a two-note chime, a menu press a soft tick. The sound
// setting mutes it: the context suspends, so nothing plays at all. Every
// call is guarded — a browser with no audio (or a blocked context) just
// plays nothing, and the game never notices.

export function createSound() {
  let ctx = null; // the AudioContext, built lazily on the first sound
  let muted = false;

  /** Build the context on first use, or null when audio is unavailable. */
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
    return ctx;
  }

  /** One short tone: `freq` sliding to `slideTo` over `dur` seconds. */
  function blip(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    try {
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch {
      // Sound never breaks the game.
    }
  }

  return {
    /** True while the sound is muted. */
    get muted() { return muted; },
    /** True when this browser can make sound at all. */
    get supported() {
      return !!(window.AudioContext || window.webkitAudioContext);
    },

    /** Mute or unmute: a muted context suspends, so nothing plays. */
    setMuted(m) {
      muted = !!m;
      if (!ctx) return;
      try {
        if (muted) ctx.suspend();
        else ctx.resume();
      } catch {
        // A context that will not suspend or resume stays as it is.
      }
    },

    /** A pistol round: a square pop sliding down. */
    shot() { blip(220, 0.12, 'square', 0.1, 60); },
    /** A punch landing: a low sine thud. */
    punch() { blip(140, 0.1, 'sine', 0.18, 70); },
    /** A mission paid out: two notes, up a fourth. */
    chime() {
      blip(660, 0.15, 'sine', 0.14);
      setTimeout(() => blip(880, 0.2, 'sine', 0.14), 120);
    },
    /** A menu press: a soft tick. */
    click() { blip(900, 0.05, 'sine', 0.07); },
  };
}
