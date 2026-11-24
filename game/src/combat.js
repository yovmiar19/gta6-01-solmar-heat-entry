// Step 10 — shooting and fighting, step 14 — new weapons. Raka carries
// his weapons on a bar, like Karimbu's: slot 1 is his Fists (infinite,
// close range), slot 2 is his Pistol (a Handgun, 12 in the magazine, 24
// spare), slot 3 is the SMG, slot 4 the Shotgun, slot 5 the Assault Rifle
// (the last three are found as pickups around the city — see weapons.js).
// Keys 1–5 swap between them and the mouse wheel cycles the ones he owns;
// a left click uses whichever is selected, and the SMG and the rifle keep
// firing while the trigger is held.
//
// A punch is short and simple: anything shootable within about two metres,
// in front of him, takes the hit. The dummy counts as a hit (the Target
// Practice job counts it, same as a round). A pedestrian takes a shove and
// runs away scared — hitting one is a crime, so it earns a star. A patrol
// car takes the hit as an assault on the police, which earns a star too.
// A punch has no tracer and no spark: the arm swing is the effect.
//
// Every gun action — the shot, the reload, the ammo, the effects — lives
// in weapons.js now; this module keeps the practice dummy, the punch, and
// the aim-pose timer, and passes the gun calls straight through, so the
// game loop and the old tests read exactly what they did.

import { createWeapons } from './weapons.js';

const PUNCH_RANGE = 2.2; // how far a punch reaches, in metres
const PUNCH_CONE = 0.45; // how far off-centre a punch still lands (cosine)
const PUNCH_COOLDOWN = 0.4; // seconds between punches
const PUNCH_SHOVE = 0.6; // metres a punched pedestrian is shoved

/**
 * Build the combat rig. `scene` is the city, `hero` is Raka's rig (for the
 * muzzle position, the aim pose and the punch swing), `police` is the
 * wanted system (a hit on a patrol car or a pedestrian earns a star),
 * `traffic` is the street (its pedestrians are what a punch can reach),
 * `onHit` fires when a round or a punch lands on something hittable (the
 * HUD flashes its hit marker), `onShot` fires after every round that
 * leaves the muzzle, with the landing point (so the street can scare the
 * pedestrians standing near it), `onCrime` fires when a pedestrian is
 * hit (the district sours), `onPickup` fires when Raka takes a gun
 * (the game shows a banner), and `jobsDone` says how many side jobs are
 * finished (the rifle's cache stays shut until it reaches three).
 */
export function createCombat(scene, hero, police, traffic, onHit, onShot, onCrime, onPickup, jobsDone) {
  // --- the practice dummy: a pole and a ringed board on the avenue ---------
  // It stands 8 metres north of where Raka starts, so a shot straight ahead
  // from the start lands on it. Its meshes carry userData.dummy, so the
  // raycast knows what it hit. A punch checks the same spot by distance.
  const dummy = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), poleMat);
  pole.position.y = 0.55;
  pole.castShadow = true;
  dummy.add(pole);
  function ring(size, color, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, 0.06),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    mesh.position.set(0, 1.45, z);
    mesh.castShadow = true;
    return mesh;
  }
  dummy.add(ring(1.0, 0xf5f0e6, 0)); // white board
  dummy.add(ring(0.7, 0x2b2b2b, 0.04)); // dark ring
  dummy.add(ring(0.4, 0xc23b2e, 0.08)); // red centre
  dummy.position.set(0, 0, 2);
  dummy.traverse((child) => { child.userData.dummy = true; });
  scene.add(dummy);

  // --- the guns: owned, aimed and fired by weapons.js -----------------------
  const weapons = createWeapons(scene, hero, police, traffic, onHit, onShot, onCrime, onPickup, jobsDone);

  let punchCooldown = 0;
  let aimTimer = 0; // seconds the aim pose still holds after a shot
  let punchesThrown = 0; // punches swung, hit or miss
  let punchHits = 0; // punches that landed on something hittable
  let dummyPunches = 0; // punches that landed on the practice dummy alone

  /**
   * Is a point in front of Raka and close enough to punch? `x, z` is the
   * target's spot on the ground; the facing is Raka's yaw, the reach is
   * the punch range, and the cone is wide enough that a punch at someone
   * standing just off his shoulder still lands.
   */
  function inPunchReach(x, z) {
    const dx = x - hero.group.position.x;
    const dz = z - hero.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d > PUNCH_RANGE) return false;
    if (d < 0.01) return true;
    const facing = Math.sin(hero.yaw) * (dx / d) + Math.cos(hero.yaw) * (dz / d);
    return facing > PUNCH_CONE;
  }

  return {
    /** The selected weapon slot: 1 Fists, 2 Pistol, 3 SMG, 4 Shotgun, 5 AR. */
    get slot() { return weapons.slot; },
    /** The selected weapon's id ('pistol', 'smg', ...). */
    get weaponId() { return weapons.weaponId; },
    /** The selected weapon's name, shown on the HUD. */
    get weaponName() { return weapons.weaponName; },
    /** The selected weapon's category, shown on the HUD. */
    get weaponType() { return weapons.weaponType; },
    /** True while the selected gun is full-auto (SMG, AR). */
    get auto() { return weapons.auto; },
    /** Rounds left in the magazine (∞ for the fists: they never run out). */
    get mag() { return weapons.mag; },
    /** Spare rounds in reserve (∞ for the fists). */
    get reserve() { return weapons.reserve; },
    /** True while a reload is running. */
    get reloading() { return weapons.reloading; },
    /** Pulls and punches that landed on the dummy, a patrol car or a pedestrian. */
    get hits() { return weapons.hits + punchHits; },
    /** Pulls and punches that landed on the practice dummy alone (a mission counts them). */
    get dummyHits() { return weapons.dummyHits + dummyPunches; },
    /** Rounds fired so far (trigger pulls, all guns). */
    get shotsFired() { return weapons.shotsFired; },
    /** Summed pellet damage dealt (the test harness reads it). */
    get damageDealt() { return weapons.damageDealt; },
    /** Damage of the most recent pull. */
    get lastDamage() { return weapons.lastDamage; },
    /** Pellets of the most recent pull that landed on something hittable. */
    get lastPelletsHit() { return weapons.lastPelletsHit; },
    /** Which gun the most recent pull used. */
    get lastShotWeapon() { return weapons.lastShotWeapon; },
    /** Spread grown by holding the trigger (0 when the trigger is up). */
    get bloom() { return weapons.bloom; },
    /** Tracers lit right now (never more than the pool holds). */
    get activeTracers() { return weapons.activeTracers; },
    /** Which guns Raka owns, by id. */
    get owned() { return weapons.owned; },
    /** True when Raka owns the named gun. */
    owns(id) { return weapons.owns(id); },
    /** The pickups: weapon, spot, taken, and whether the rifle's cache is open. */
    get pickups() { return weapons.pickups; },
    /** Damage multiplier for a pellet of a gun that flew `dist` metres. */
    falloffFor(id, dist) { return weapons.falloffFor(id, dist); },
    /** The gun table (the test harness reads the tuned numbers off it). */
    get defs() { return weapons.defs; },
    /** Punches swung so far, hit or miss. */
    get punchesThrown() { return punchesThrown; },
    /** Punches that landed on something hittable. */
    get punchHits() { return punchHits; },
    /** Where the last round landed, x (a scare for pedestrians nearby). */
    get shotX() { return weapons.shotX; },
    /** Where the last round landed, z (a scare for pedestrians nearby). */
    get shotZ() { return weapons.shotZ; },
    /** True while Raka should hold the aim pose (just after a shot). */
    get aiming() { return aimTimer > 0; },
    /** The gun system itself (the game loop reads its pickups for the radar). */
    get weapons() { return weapons; },

    /**
     * Swap weapons: 1 is the fists, 2 the pistol, 3 the SMG, 4 the
     * shotgun, 5 the assault rifle. A gun Raka does not own yet cannot
     * be selected. A reload in progress is dropped when he puts the gun
     * away.
     */
    selectSlot(next) {
      return weapons.selectSlot(next);
    },

    /** Step to the next (dir +1) or previous (dir -1) OWNED weapon, as the mouse wheel does. */
    cycleSlot(dir) {
      return weapons.cycleSlot(dir);
    },

    /** Give Raka a gun at once (a pickup, or the test harness). */
    give(id) {
      return weapons.give(id);
    },

    /** Tell the gun system the trigger is up (the bloom bleeds off). */
    releaseTrigger() {
      weapons.releaseTrigger();
    },

    /**
     * Punch: swing a fist at whatever is in front of him, if the cooldown
     * has passed. The arm swing is the effect — the rig asks the hero to
     * throw it, hit or miss. A hit on the dummy counts for the Target
     * Practice job; a hit on a pedestrian shoves them and scares them
     * into running (and earns a star, like a round would); a hit on a
     * patrol car is an assault on the police (and earns a star too).
     */
    punch() {
      if (punchCooldown > 0) return false;
      punchCooldown = PUNCH_COOLDOWN;
      punchesThrown += 1;
      hero.punch();

      let landed = false;
      // The dummy: standing 8 metres up the avenue from the start.
      if (inPunchReach(dummy.position.x, dummy.position.z)) {
        punchHits += 1;
        dummyPunches += 1;
        landed = true;
      }
      // The pedestrians: the nearest one in reach takes a shove and runs.
      if (traffic) {
        for (const npc of traffic.npcs) {
          const nx = npc.group.position.x;
          const nz = npc.group.position.z;
          if (!inPunchReach(nx, nz)) continue;
          // The shove: a step backwards, away from Raka, then the run.
          const dx = nx - hero.group.position.x;
          const dz = nz - hero.group.position.z;
          const d = Math.hypot(dx, dz) || 1;
          npc.group.position.x += (dx / d) * PUNCH_SHOVE;
          npc.group.position.z += (dz / d) * PUNCH_SHOVE;
          npc.fleeFrom(hero.group.position.x, hero.group.position.z);
          police.noteAssault();
          // Step 13: hitting a pedestrian sours the district he stands in.
          if (onCrime) onCrime(nx, nz);
          punchHits += 1;
          landed = true;
          break; // one punch, one pedestrian
        }
      }
      // A patrol car close enough to touch: punching the police is a crime.
      if (police) {
        for (const car of police.patrolPositions) {
          if (!inPunchReach(car.x, car.z)) continue;
          police.noteAssault();
          punchHits += 1;
          landed = true;
          break; // one punch, one patrol car
        }
      }
      if (landed && onHit) onHit();
      return true;
    },

    /**
     * Fire one trigger pull with the selected gun, if the magazine is not
     * empty, the reload is not running and the cooldown has passed.
     * `aiming` says whether Raka is holding right mouse: an aimed round
     * flies nearly true, a hip-fired one wobbles. The aim pose holds for
     * a beat after the pull.
     */
    shoot(aiming = false) {
      if (weapons.slot === 1) return false;
      const fired = weapons.shoot(aiming);
      if (fired) aimTimer = 0.45;
      return fired;
    },

    /** Start a reload, if the magazine is short and the reserve is not dry. The fists never reload. */
    reload() {
      return weapons.reload();
    },

    /**
     * Stage the shooting screenshot: one pull already fired at the dummy,
     * its tracer and flash held on the frame (they do not fade while the
     * scene is frozen), the magazine one pull down.
     */
    stageShoot() {
      weapons.stageShoot();
      aimTimer = 999; // hold the aim pose for the frozen frame
    },

    /** Refill the weapon (a fresh start after BUSTED or WASTED). */
    reset() {
      weapons.reset();
      punchCooldown = 0;
      aimTimer = 0;
      dummyPunches = 0;
      hero.aim(false);
    },

    /** Save the owned guns and their ammo (the save file keeps them). */
    saveState() {
      return weapons.saveState();
    },

    /** Put a save's guns back (a gun the save never owned stays locked). */
    restoreState(saved) {
      weapons.restoreState(saved);
    },

    /** Advance the timers: punch cooldown, aim pose, and the guns'. */
    update(dt) {
      punchCooldown = Math.max(0, punchCooldown - dt);
      if (aimTimer > 0 && aimTimer < 900) {
        aimTimer = Math.max(0, aimTimer - dt);
        if (aimTimer === 0) hero.aim(false);
      }
      weapons.update(dt);
    },
  };
}
