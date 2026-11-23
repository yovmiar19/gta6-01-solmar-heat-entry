// The step-4 HUD: on foot it shows what Raka is doing (idle / walking /
// running) and how fast; in the car it shows DRIVING and the car's speed.
// It also carries the action prompt ("Press E to enter the Sunset GT"), the
// wanted stars, the BUSTED overlay — and, since step 4, the survival panel
// (bottom-right): Raka's HEALTH and STAMINA bars with their numbers, his
// current WEAPON with its TYPE, and the BULLET COUNT (magazine / reserve).
// A hit marker flashes in the middle of the screen when a round lands, and
// a WASTED overlay covers the screen when his health runs out.

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
  const wastedEl = document.getElementById('wasted-overlay');
  const healthBarEl = document.getElementById('health-bar');
  const healthNumEl = document.getElementById('health-num');
  const staminaBarEl = document.getElementById('stamina-bar');
  const staminaNumEl = document.getElementById('stamina-num');
  const weaponNameEl = document.getElementById('weapon-name');
  const weaponTypeEl = document.getElementById('weapon-type');
  const ammoEl = document.getElementById('ammo-num');
  const hitmarkerEl = document.getElementById('hitmarker');
  let lastState = '';
  let lastWanted = -1;
  let lastHealth = -1;
  let lastStamina = -1;
  let lastAmmo = '';
  let lastWeapon = '';
  let hitTimer = null;

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
     * Refresh the driving readouts. `speed` is the vehicle's signed speed
     * in metres per second (negative while reversing); `vehicleName` is
     * the ride Raka is in ("Sunset GT", "Sedan", "Motor", "Truk", "Bus").
     * The name rides in the cache key, so swapping rides refreshes the
     * readouts even while the driving state stays the same.
     */
    updateDriving(speed, vehicleName = 'Sunset GT') {
      const state = Math.abs(speed) < 0.3 ? 'PARKED' : speed < 0 ? 'REVERSING' : 'DRIVING';
      const key = `${state}|${vehicleName}`;
      if (key !== lastState) {
        modeEl.textContent = 'DRIVING';
        stateEl.textContent = state;
        speedWhatEl.textContent = vehicleName;
        statusEl.textContent = state === 'PARKED'
          ? `Raka is parked in the ${vehicleName} in Solmar Bay.`
          : `Raka is ${state.toLowerCase()} the ${vehicleName} through Solmar Bay.`;
        lastState = key;
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
    /** Show or hide the big WASTED overlay (health ran out). */
    showWasted(show) {
      wastedEl.style.display = show ? 'flex' : 'none';
    },
    /**
     * Refresh the HEALTH bar and number (0–max). The bar turns from green
     * to red as it falls, so a glance says how hurt Raka is.
     */
    setHealth(health, max) {
      const shown = Math.round(health);
      if (shown === lastHealth) return;
      lastHealth = shown;
      healthNumEl.textContent = String(shown);
      healthBarEl.style.width = `${Math.max(0, Math.min(100, (health / max) * 100)).toFixed(0)}%`;
      healthBarEl.style.background = health / max > 0.5 ? '#7ed957'
        : health / max > 0.25 ? '#f2c94c' : '#ff4d3d';
    },
    /**
     * Refresh the STAMINA bar and number (0–max). It drains while Raka runs
     * and grows back while he walks or stands still.
     */
    setStamina(stamina, max) {
      const shown = Math.round(stamina);
      if (shown === lastStamina) return;
      lastStamina = shown;
      staminaNumEl.textContent = String(shown);
      staminaBarEl.style.width = `${Math.max(0, Math.min(100, (stamina / max) * 100)).toFixed(0)}%`;
    },
    /**
     * Refresh the WEAPON readouts: the weapon's NAME ("Pistol"), its TYPE
     * ("Handgun") and the BULLET COUNT as magazine / reserve ("12 / 24").
     * While a reload runs the count reads "RELOADING…".
     */
    setWeapon(name, type, mag, reserve, reloading) {
      const key = `${name}|${type}`;
      if (key !== lastWeapon) {
        weaponNameEl.textContent = name;
        weaponTypeEl.textContent = type;
        lastWeapon = key;
      }
      const ammo = reloading ? 'RELOADING…' : `${mag} / ${reserve}`;
      if (ammo !== lastAmmo) {
        ammoEl.textContent = ammo;
        ammoEl.classList.toggle('empty', !reloading && mag === 0);
        lastAmmo = ammo;
      }
    },
    /** Flash the hit marker in the middle of the screen: a round landed. */
    showHit() {
      hitmarkerEl.style.opacity = '1';
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => { hitmarkerEl.style.opacity = '0'; }, 150);
    },
  };
}
