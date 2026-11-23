// Step 10 — the vertical rig: jumping, vaulting over low obstacles,
// climbing up onto them, and falling off an edge. Raka's feet live at a
// height `y` above the street; the street itself is 0, the top of a crate
// or a low wall is its height. The game loop asks the ground height under
// Raka every frame and lets this rig decide where his feet are.
//
// A jump is plain ballistics: an upward kick, gravity pulling him back
// down, a landing on whatever ground is under him when he comes down. A
// vault is a jump with a bigger kick and a forward lean — high enough to
// clear a crate, and the game loop adds a burst of speed while it lasts,
// so he lands on the far side instead of on top of it. A climb is not a
// jump at all: Raka steps up onto the obstacle's top over a third of a
// second, then stands there as if it were the street, until he walks off
// its edge — at which point gravity takes him back down to the street.
//
// The rig never moves Raka sideways: the game loop owns his x and z. It
// only owns y, and the two flags the animation reads (airborne, vaulting).

const GRAVITY = 22; // metres per second squared, pulling him down
const JUMP_VELOCITY = 6.8; // the kick for a plain jump: ~1.05 m high
const VAULT_VELOCITY = 9.0; // the kick for a vault: ~1.8 m high, clears a crate with room to spare
const VAULT_TIME = 0.55; // seconds the vault burst lasts
const CLIMB_TIME = 0.35; // seconds a climb takes, bottom to top

/** Build the vertical rig. `groundY` is never needed here: the caller passes the ground height under Raka into update() every frame. */
export function createMovement() {
  let y = 0; // where Raka's feet are right now, in metres above the street
  let vy = 0; // his vertical speed (up is positive)
  let airborne = false; // true between leaving the ground and landing on it
  let vaulting = false; // true while a vault's burst is running
  let vaultTimer = 0; // seconds of vault burst left
  let climbing = false; // true while a climb is animating
  let climbTimer = 0; // seconds into the climb
  let climbFrom = 0; // the height the climb started at
  let climbTo = 0; // the height the climb ends at (the obstacle's top)

  return {
    /** Where Raka's feet are, in metres above the street. */
    get y() { return y; },
    /** True while Raka is off the ground (jump, vault, or falling). */
    get airborne() { return airborne; },
    /** True while a vault's burst is running (the game loop adds speed). */
    get vaulting() { return vaulting; },
    /** True while a climb is animating onto an obstacle's top. */
    get climbing() { return climbing; },

    /**
     * Jump: kick off the ground, if he is standing on it. Returns true
     * when the jump started. A jump from a crate's top is a jump like any
     * other — it just starts higher up.
     */
    jump() {
      if (airborne || climbing) return false;
      vy = JUMP_VELOCITY;
      airborne = true;
      return true;
    },

    /**
     * Vault: a higher kick than a jump, with a burst flag the game loop
     * reads to add forward speed, so he clears the obstacle and lands on
     * the far side. Returns true when the vault started.
     */
    vault() {
      if (airborne || climbing) return false;
      vy = VAULT_VELOCITY;
      airborne = true;
      vaulting = true;
      vaultTimer = VAULT_TIME;
      return true;
    },

    /**
     * Climb: step up onto an obstacle's top, over a third of a second.
     * `topY` is the top's height. Returns true when the climb started.
     */
    climb(topY) {
      if (airborne || climbing) return false;
      climbing = true;
      climbTimer = 0;
      climbFrom = y;
      climbTo = topY;
      return true;
    },

    /**
     * One frame. `ground` is the ground height under Raka right now (0 on
     * the street, an obstacle's top while he stands on one). Returns his
     * feet's height. While he is airborne, gravity runs and a landing is
     * a return to the ground under him; while he stands, his feet follow
     * the ground — and walking off an edge drops him into a fall.
     */
    update(dt, ground) {
      if (climbing) {
        climbTimer += dt;
        const k = Math.min(1, climbTimer / CLIMB_TIME);
        // Ease up: quick off the bottom, settling onto the top.
        const eased = 1 - (1 - k) * (1 - k);
        y = climbFrom + (climbTo - climbFrom) * eased;
        if (k >= 1) climbing = false;
        return y;
      }
      if (vaulting) {
        vaultTimer -= dt;
        if (vaultTimer <= 0) vaulting = false;
      }
      if (airborne) {
        vy -= GRAVITY * dt;
        y += vy * dt;
        // A vault clears the obstacle: while it runs, the landing ignores
        // the obstacle's top (the collision is off for the vault), so he
        // comes down on the far side instead of on top of it. A plain
        // jump or a fall lands on whatever ground is under him, a crate's
        // top included.
        const landing = vaulting ? 0 : ground;
        if (y <= landing) {
          // Landed: feet on the ground under him, at rest.
          y = landing;
          vy = 0;
          airborne = false;
          vaulting = false;
        }
        return y;
      }
      if (y > ground + 0.02) {
        // He walked off an edge (a crate's top, a wall): he falls.
        airborne = true;
        vy = 0;
        return y;
      }
      y = ground;
      return y;
    },

    /** Put his feet on a height at once (a fresh start, or leaving the water). */
    snapTo(ground) {
      y = ground;
      vy = 0;
      airborne = false;
      vaulting = false;
      climbing = false;
    },

    /** Back to standing on the street, at rest (a fresh start). */
    reset() {
      y = 0;
      vy = 0;
      airborne = false;
      vaulting = false;
      climbing = false;
      climbTimer = 0;
    },
  };
}
