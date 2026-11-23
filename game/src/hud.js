// The step-2 HUD: on foot it shows what Raka is doing (idle / walking /
// running) and how fast; in the car it shows DRIVING and the car's speed.
// It also carries the action prompt ("Press E to enter the Sunset GT").
// The minimap, money, wanted stars and missions come in later steps.

const FOOT_TOP_KMH = 21; // the fastest the pace bar ever fills to on foot
const CAR_TOP_KMH = 80; // the fastest it fills to while driving

export function createHud() {
  const modeEl = document.getElementById('mode-label');
  const stateEl = document.getElementById('move-state');
  const speedEl = document.getElementById('speed-num');
  const speedWhatEl = document.getElementById('speed-what');
  const paceEl = document.getElementById('pace-bar');
  const statusEl = document.getElementById('status');
  const promptEl = document.getElementById('car-prompt');
  const wantedBoxEl = document.getElementById('wanted-box');
  const wantedStarsEl = document.getElementById('wanted-stars');
  const bustedEl = document.getElementById('busted-overlay');
  let lastState = '';
  let lastWanted = -1;

  function showSpeed(kmh, top) {
    speedEl.textContent = String(kmh);
    paceEl.style.width = `${Math.min(100, (kmh / top) * 100).toFixed(0)}%`;
  }

  return {
    /**
     * Refresh the on-foot readouts. `speed` is Raka's ground speed in metres
     * per second; `moving` and `running` say what he is doing.
     */
    updateFoot(speed, moving, running) {
      const state = !moving ? 'IDLE' : running ? 'RUNNING' : 'WALKING';
      if (state !== lastState) {
        modeEl.textContent = 'ON FOOT';
        stateEl.textContent = state;
        speedWhatEl.textContent = 'Raka';
        statusEl.textContent = `Raka is ${state.toLowerCase()} in Solmar Bay.`;
        lastState = state;
      }
      showSpeed(Math.round(speed * 3.6), FOOT_TOP_KMH);
    },
    /**
     * Refresh the driving readouts. `speed` is the car's signed speed in
     * metres per second (negative while reversing).
     */
    updateDriving(speed) {
      const state = Math.abs(speed) < 0.3 ? 'PARKED' : speed < 0 ? 'REVERSING' : 'DRIVING';
      if (state !== lastState) {
        modeEl.textContent = 'DRIVING';
        stateEl.textContent = state;
        speedWhatEl.textContent = 'Sunset GT';
        statusEl.textContent = state === 'PARKED'
          ? 'Raka is parked in the Sunset GT in Solmar Bay.'
          : `Raka is ${state.toLowerCase()} the Sunset GT through Solmar Bay.`;
        lastState = state;
      }
      showSpeed(Math.round(Math.abs(speed) * 3.6), CAR_TOP_KMH);
    },
    /** Show the action prompt ("Press E ..."), or hide it with null. */
    setPrompt(text) {
      if (text) {
        promptEl.textContent = text;
        promptEl.style.display = 'block';
      } else {
        promptEl.style.display = 'none';
      }
    },
    /**
     * Show the wanted level as stars (★★★☆☆). The box only appears while
     * the heat is on; at zero stars it hides again.
     */
    setWanted(stars) {
      if (stars === lastWanted) return;
      lastWanted = stars;
      if (stars > 0) {
        wantedStarsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
        wantedBoxEl.style.display = 'block';
      } else {
        wantedBoxEl.style.display = 'none';
      }
    },
    /** Show or hide the big BUSTED overlay in the middle of the screen. */
    showBusted(show) {
      bustedEl.style.display = show ? 'flex' : 'none';
    },
  };
}
