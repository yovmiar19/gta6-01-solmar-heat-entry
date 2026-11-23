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
  const crosshairEl = document.getElementById('crosshair');
  const missionNameEl = document.getElementById('mission-name');
  const missionObjectiveEl = document.getElementById('mission-objective');
  const cashNumEl = document.getElementById('cash-num');
  const missionBannerEl = document.getElementById('mission-banner');
  const clockEl = document.getElementById('clock');
  const clockSubEl = document.getElementById('clock-sub');
  const drownEl = document.getElementById('drown-warning');
  const drownNumEl = document.getElementById('drown-num');
  const diveEl = document.getElementById('dive-overlay');
  const storyBeatEl = document.getElementById('story-beat');
  const hintEl = document.getElementById('hint');
  const defaultHint = hintEl ? hintEl.innerHTML : '';
  let lastStoryBeat = '';
  let lastDrown = -1;
  let lastClock = '';
  let lastState = '';
  let lastWanted = -1;
  let lastHealth = -1;
  let lastStamina = -1;
  let lastAmmo = '';
  let lastWeapon = '';
  let lastMission = '';
  let lastCash = -1;
  let hitTimer = null;
  let bannerTimer = null;

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
     * While a reload runs the count reads "RELOADING…". The fists never
     * run out, so their count reads "∞".
     */
    setWeapon(name, type, mag, reserve, reloading) {
      const key = `${name}|${type}`;
      if (key !== lastWeapon) {
        weaponNameEl.textContent = name;
        weaponTypeEl.textContent = type;
        lastWeapon = key;
      }
      const ammo = reloading ? 'RELOADING…' : mag === '∞' ? '∞' : `${mag} / ${reserve}`;
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
    /**
     * Show or hide the aim crosshair in the middle of the screen. It only
     * appears while Raka holds right mouse: the bidik the player aims with.
     */
    setAiming(on) {
      crosshairEl.style.display = on ? 'block' : 'none';
    },
    /**
     * Show the active mission: its NAME ("Pier Run") and its OBJECTIVE
     * ("Drive to the pier drop-off at the north end"). With no mission in
     * progress the panel says so and points Raka at the job marker.
     */
    setMission(name, objective) {
      const key = `${name ?? ''}|${objective ?? ''}`;
      if (key === lastMission) return;
      lastMission = key;
      missionNameEl.textContent = name ?? 'NO MISSION';
      missionObjectiveEl.textContent = objective ?? 'Walk into the glowing cyan marker to start a job.';
    },
    /**
     * Show the cash total banked from finished missions, with a thousands
     * separator ("$2,900"), so a glance says how much the jobs paid.
     */
    setCash(cash) {
      if (cash === lastCash) return;
      lastCash = cash;
      cashNumEl.textContent = `$${cash.toLocaleString('en-US')}`;
    },
    /**
     * Refresh the swimming readouts. `speed` is Raka's swim speed in metres
     * per second; `fast` says he is sprint-swimming on Shift. The pace bar
     * tops out at 15 km/h, a fast swimmer's pace.
     */
    updateSwim(speed, fast) {
      const state = fast ? 'FAST SWIM' : 'SWIMMING';
      if (state !== lastState) {
        modeEl.textContent = 'SWIMMING';
        stateEl.textContent = state;
        speedWhatEl.textContent = 'Raka';
        statusEl.textContent = 'Raka is swimming in Solmar Bay.';
        lastState = state;
      }
      showSpeed(Math.round(speed * 3.6), 15);
    },
    /**
     * Show or hide the drowning warning ("STAMINA GONE — SWIM BACK! 4s"):
     * Raka is out of stamina in deep water, and the seconds left before he
     * goes under. It only rewrites when the count changes.
     */
    showDrownWarning(show, secondsLeft = 0) {
      const shown = show ? Math.ceil(secondsLeft) : -1;
      if (shown === lastDrown) return;
      lastDrown = shown;
      if (show) {
        drownNumEl.textContent = String(shown);
        drownEl.style.display = 'block';
      } else {
        drownEl.style.display = 'none';
      }
    },
    /**
     * Refresh the CLOCK (top-right): the game time ("14:30") and, under it,
     * the phase of day with a sun/moon mark and the weather ("☀ DAY · CLEAR",
     * "☾ NIGHT · RAIN"). The line only rewrites when it actually changes.
     */
    setClock(hours, phase, weather) {
      const h = Math.floor(hours) % 24;
      const m = Math.floor((hours % 1) * 60);
      const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const icon = (phase === 'NIGHT' || phase === 'DUSK') ? '☾' : '☀';
      const key = `${text}|${icon} ${phase} · ${weather}`;
      if (key === lastClock) return;
      lastClock = key;
      clockEl.textContent = text;
      clockSubEl.textContent = `${icon} ${phase} · ${weather}`;
    },
    /**
     * Show or hide the underwater tint (step 10): Raka is diving below the
     * surface, so the whole screen goes blue until he comes back up.
     */
    showDive(on) {
      if (diveEl) diveEl.style.display = on ? 'block' : 'none';
    },
    /**
     * Flash the mission banner across the top of the screen ("MISSION
     * COMPLETE — Pier Run +$800") for three seconds, then hide it.
     */
    showMissionBanner(text) {
      missionBannerEl.textContent = text;
      missionBannerEl.style.display = 'block';
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { missionBannerEl.style.display = 'none'; }, 3000);
    },
    /**
     * Show the story beat in progress ("ACT I — HOMECOMING") under the
     * mission panel (step 11): a glance says where Raka is in the story.
     */
    setStoryBeat(text) {
      if (!storyBeatEl) return;
      if (text === lastStoryBeat) return;
      lastStoryBeat = text;
      storyBeatEl.textContent = text;
    },
    /**
     * Swap the bottom hint line for a moment ("Space: advance the
     * dialogue · Esc: skip"), or hand it back to the default controls
     * line with null (step 11).
     */
    setHint(text) {
      if (!hintEl) return;
      hintEl.innerHTML = text ?? defaultHint;
    },
  };
}
