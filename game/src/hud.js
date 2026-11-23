// The step-1 HUD: what the hero is doing (idle / walking / running) and how
// fast, plus a pace bar. It is the only HUD step 1 needs — the minimap, money,
// wanted stars and missions come in later steps.

const RUN_TOP_KMH = 21; // the fastest the pace bar ever fills to

export function createHud() {
  const stateEl = document.getElementById('move-state');
  const speedEl = document.getElementById('speed-num');
  const paceEl = document.getElementById('pace-bar');
  const statusEl = document.getElementById('status');
  let lastState = '';

  return {
    /**
     * Refresh the readouts. `speed` is the hero's ground speed in metres per
     * second; `moving` and `running` say what he is doing.
     */
    update(speed, moving, running) {
      const state = !moving ? 'IDLE' : running ? 'RUNNING' : 'WALKING';
      if (state !== lastState) {
        stateEl.textContent = state;
        statusEl.textContent = `Raka is ${state.toLowerCase()} in Solmar Bay.`;
        lastState = state;
      }
      const kmh = Math.round(speed * 3.6);
      speedEl.textContent = String(kmh);
      paceEl.style.width = `${Math.min(100, (kmh / RUN_TOP_KMH) * 100).toFixed(0)}%`;
    },
  };
}
