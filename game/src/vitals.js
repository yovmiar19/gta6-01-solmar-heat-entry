// Step 4 — Raka's vitals: health and stamina. Health falls when the police
// hurt him (a ram while driving, a patrol car on top of him on foot); at
// zero he is WASTED and the game hauls him back to the start. Stamina drains
// while he runs and comes back while he walks or stands still; run it dry
// and he is winded — he can only walk until it has come back a little.

const MAX_HEALTH = 100;
const MAX_STAMINA = 100;
const STAMINA_DRAIN = 22; // points a second while running
const STAMINA_REGEN = 12; // points a second while walking or standing
const WINDED_FLOOR = 15; // stamina must climb back to this before running again

/** Build the vitals rig: full health, full stamina, ready to run. */
export function createVitals() {
  let health = MAX_HEALTH;
  let stamina = MAX_STAMINA;
  let winded = false; // ran dry: walking only until the stamina recovers

  return {
    /** The most health Raka can have. */
    maxHealth: MAX_HEALTH,
    /** The most stamina Raka can have. */
    maxStamina: MAX_STAMINA,
    /** Health right now (0 means WASTED). */
    get health() { return health; },
    /** Stamina right now. */
    get stamina() { return stamina; },
    /** True once Raka is WASTED. */
    get wasted() { return health <= 0; },
    /** True while Raka may run (not winded). */
    get canRun() { return !winded; },

    /** Hurt Raka by `amount` (never below zero). */
    damage(amount) {
      health = Math.max(0, health - amount);
    },

    /** Set the health at once (a load puts back what the save held). */
    setHealth(value) {
      health = Math.max(0, Math.min(MAX_HEALTH, value));
    },

    /** Set the stamina at once (the test harness drains it for the drown check). */
    setStamina(value) {
      stamina = Math.max(0, Math.min(MAX_STAMINA, value));
      if (stamina > 0) winded = false;
    },

    /**
     * One frame: drain the stamina while running, grow it back otherwise.
     * `running` says he is running right now (moving, Shift held, allowed).
     */
    update(dt, running) {
      if (running) {
        stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
        if (stamina <= 0) winded = true;
      } else {
        stamina = Math.min(MAX_STAMINA, stamina + STAMINA_REGEN * dt);
        if (winded && stamina >= WINDED_FLOOR) winded = false;
      }
    },

    /** Full health, full stamina, ready to run (a fresh start). */
    reset() {
      health = MAX_HEALTH;
      stamina = MAX_STAMINA;
      winded = false;
    },
  };
}
