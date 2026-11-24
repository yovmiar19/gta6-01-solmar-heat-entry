// Step 14 — new weapons: SMG, Shotgun, Assault Rifle. Raka starts with
// the Pistol he has carried since step 4; the three new guns are found in
// the world as glowing pickups (one per gun), and the assault rifle's cache
// only opens once he has finished three side jobs — the black market does
// not deal with strangers. Each gun is distinct: the SMG sprays fast and
// close, the shotgun throws a spread of pellets that hurts most point
// blank, and the rifle reaches far and stays tight while aimed. The fists
// stay slot 1 and never run out of ammo.
//
// The effects are capped on purpose: a pool of six tracer lines, one
// shared muzzle flash and four impact sparks, reused in turn — a long
// SMG burst never spawns more lines than the pool holds, so a firefight
// cannot drag the frame rate down with it.
//
// This module owns the gun table, the ammo per gun, which guns Raka owns,
// the pickups, and the shot itself (raycasts, spread, falloff, effects).
// combat.js keeps the punch and the dummy and delegates every gun action
// here, so the public face (slot, mag, reserve, shoot, reload, reset)
// does not change for the game loop or the old tests.

const MAX_TRACERS = 6; // tracer lines alive at once, ever
const MAX_SPARKS = 4; // impact spark bursts alive at once, ever
const PICKUP_RANGE = 2.2; // how close Raka must be to take a pickup
const PICKUP_BOB = 0.25; // how high a pickup bobs above the ground

// --- the gun table -----------------------------------------------------------
// damage is per pellet that lands; pellets is how many a trigger pull
// throws; cooldown is seconds between pulls (the SMG and the rifle are
// full-auto while the trigger is held, the pistol and the shotgun are
// not); range is how far a pellet flies; falloff is [fullTo, fadeTo,
// minMult] — full damage out to fullTo metres, fading to minMult at
// fadeTo; hipSpread/aimSpread are radians of wobble; bloom is how much
// the spread grows per shot held down, up to bloomMax, and it bleeds off
// when the trigger is released.
export const WEAPON_DEFS = {
  fists: {
    id: 'fists', slot: 1, name: 'Fists', type: 'Unarmed',
    damage: 0, pellets: 0, cooldown: 0, magSize: 0, reserveStart: 0,
    reserveMax: 0, reloadTime: 0, range: 0, auto: false,
    falloff: [0, 0, 1], hipSpread: 0, aimSpread: 0, bloom: 0, bloomMax: 0,
  },
  pistol: {
    id: 'pistol', slot: 2, name: 'Pistol', type: 'Handgun',
    damage: 20, pellets: 1, cooldown: 0.22, magSize: 12, reserveStart: 24,
    reserveMax: 48, reloadTime: 1.2, range: 30, auto: false,
    falloff: [15, 30, 0.6], hipSpread: 0.03, aimSpread: 0.004, bloom: 0, bloomMax: 0,
  },
  smg: {
    id: 'smg', slot: 3, name: 'SMG', type: 'Submachine Gun',
    damage: 18, pellets: 1, cooldown: 0.083, magSize: 30, reserveStart: 120,
    reserveMax: 180, reloadTime: 1.4, range: 24, auto: true,
    falloff: [10, 24, 0.5], hipSpread: 0.045, aimSpread: 0.012, bloom: 0.004, bloomMax: 0.045,
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'Shotgun', type: 'Pump Shotgun',
    damage: 9, pellets: 8, cooldown: 1.0, magSize: 6, reserveStart: 24,
    reserveMax: 48, reloadTime: 2.2, range: 18, auto: false,
    falloff: [8, 18, 0.25], hipSpread: 0.105, aimSpread: 0.06, bloom: 0, bloomMax: 0,
  },
  ar: {
    id: 'ar', slot: 5, name: 'Assault Rifle', type: 'Assault Rifle',
    damage: 26, pellets: 1, cooldown: 0.11, magSize: 30, reserveStart: 90,
    reserveMax: 150, reloadTime: 1.8, range: 45, auto: true,
    falloff: [30, 45, 0.7], hipSpread: 0.02, aimSpread: 0.003, bloom: 0.003, bloomMax: 0.03,
  },
};

export const SLOT_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'ar'];

// --- the pickups -------------------------------------------------------------
// Where each gun waits in the world. The SMG sits by the pier at the
// north end of the avenue (the harbour stash); the shotgun waits in Old
// Pasaru, west side; the rifle's cache is in Wanaru Terraces, east side,
// and only opens after three side jobs are done.
const PICKUP_DEFS = [
  { weapon: 'smg', x: 5, z: -46, label: 'SMG', color: 0x7ed957, needsJobs: 0 },
  { weapon: 'shotgun', x: -20, z: -14, label: 'SHOTGUN', color: 0xf2c94c, needsJobs: 0 },
  { weapon: 'ar', x: 30, z: 16, label: 'ASSAULT RIFLE', color: 0x5db9ff, needsJobs: 3 },
];

/**
 * Build the weapon system. `scene` is the city, `hero` is Raka's rig
 * (for the muzzle position), `police` is the wanted system (a hit on a
 * patrol car or a pedestrian earns a star), `traffic` is the street
 * (its pedestrians are what a round can reach), `onHit` fires when a
 * pull lands on something hittable (the HUD flashes its hit marker),
 * `onShot` fires after every pull that leaves the muzzle, with the
 * landing point (so the street can scare the pedestrians standing near
 * it), `onCrime` fires when a pedestrian is hit (the district sours),
 * `onPickup` fires when Raka takes a gun (the game shows a banner),
 * and `jobsDone` says how many side jobs are finished (the rifle's
 * cache stays shut until it reaches three).
 */
export function createWeapons(scene, hero, police, traffic, onHit, onShot, onCrime, onPickup, jobsDone) {
  // --- per-gun state: ammo, ownership --------------------------------------
  const state = {};
  for (const def of Object.values(WEAPON_DEFS)) {
    state[def.id] = {
      mag: def.magSize,
      reserve: def.reserveStart,
      owned: def.id === 'fists' || def.id === 'pistol',
    };
  }
  let slot = 2; // Raka starts on the pistol, as ever
  let cooldown = 0;
  let reloading = false;
  let reloadTimer = 0;
  let bloom = 0; // spread grown by holding the trigger down
  let triggerHeld = false; // true while an auto gun is firing
  let shotsFired = 0; // trigger pulls that left the muzzle, all guns
  let hits = 0; // pulls that landed on the dummy, a patrol car or a pedestrian
  let dummyHits = 0; // pulls that landed on the practice dummy alone
  let damageDealt = 0; // summed pellet damage (the test harness reads it)
  let lastDamage = 0; // damage of the most recent pull
  let lastPelletsHit = 0; // pellets of the most recent pull that landed
  let lastShotWeapon = 'pistol'; // which gun the most recent pull used
  let shotX = 0; // where the last pull landed (a scare for pedestrians nearby)
  let shotZ = 0;
  let elapsed = 0; // seconds the weapon system has run (the pickups bob on it)

  // --- the muzzle flash: one shared crossed pair at the gun's tip ----------
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flash = new THREE.Group();
  const flashA = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
  const flashB = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
  flashB.rotation.z = Math.PI / 2;
  flash.add(flashA);
  flash.add(flashB);
  flash.visible = false;
  scene.add(flash);
  flashA.raycast = () => {};
  flashB.raycast = () => {};
  let flashTimer = 0;
  const FLASH_TIME = 0.06;

  // --- the tracer pool: six lines, reused in turn, never more --------------
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    line.raycast = () => {};
    scene.add(line);
    tracers.push({ line, geo, mat, timer: 0 });
  }
  let tracerNext = 0; // the pool slot the next pull takes
  const TRACER_TIME = 0.12;

  // --- the spark pool: four bursts, reused in turn, never more -------------
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0 });
    const group = new THREE.Group();
    const shards = [];
    for (let j = 0; j < 5; j += 1) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat);
      shard.raycast = () => {};
      group.add(shard);
      shards.push({ mesh: shard, vx: 0, vy: 0, vz: 0 });
    }
    group.visible = false;
    scene.add(group);
    sparks.push({ group, mat, shards, timer: 0 });
  }
  let sparkNext = 0;
  const SPARK_TIME = 0.25;

  const raycaster = new THREE.Raycaster();
  const muzzle = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  // --- the pickups: a glowing crate with a floating gun shape --------------
  const pickups = [];
  for (const def of PICKUP_DEFS) {
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.45, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.9 }),
    );
    crate.position.y = 0.22;
    crate.castShadow = true;
    group.add(crate);
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.08, 0.64),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, emissive: def.color, emissiveIntensity: 0.35 }),
    );
    lid.position.y = 0.48;
    group.add(lid);
    // The gun itself, floating and turning above the crate.
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, def.weapon === 'shotgun' ? 0.9 : 0.7),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }),
    );
    gun.add(barrel);
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.22, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 }),
    );
    stock.position.set(0, -0.1, def.weapon === 'shotgun' ? -0.4 : -0.3);
    gun.add(stock);
    if (def.weapon === 'shotgun') {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 }),
      );
      pump.position.set(0, -0.08, 0.25);
      gun.add(pump);
    }
    if (def.weapon === 'smg') {
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.3, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }),
      );
      mag.position.set(0, -0.18, 0.05);
      gun.add(mag);
    }
    gun.position.y = 0.95;
    gun.rotation.y = 0.6;
    group.add(gun);
    // A ring of light on the ground, so the crate reads from a distance.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 32),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    group.position.set(def.x, 0, def.z);
    group.traverse((child) => { child.raycast = () => {}; }); // a pickup never stops a round
    scene.add(group);
    pickups.push({ ...def, group, gun, ring, taken: false, baseY: 0 });
  }

  /** Damage multiplier for a pellet of a gun that flew `dist` metres. */
  function falloffFor(def, dist) {
    const [fullTo, fadeTo, minMult] = def.falloff;
    if (fadeTo <= fullTo) return 1; // the fists have no falloff at all
    if (dist <= fullTo) return 1;
    if (dist >= fadeTo) return minMult;
    return 1 - ((dist - fullTo) / (fadeTo - fullTo)) * (1 - minMult);
  }

  /** Where a round leaves Raka: his chest, a little ahead of his body. */
  function muzzlePosition(out) {
    forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    out.copy(hero.group.position);
    out.y = 1.15;
    out.addScaledVector(forward, 0.55);
    return out;
  }

  /** Light the shared flash (scaled by gun) and lay one pooled tracer. */
  function showShot(from, to, def) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % MAX_TRACERS;
    const positions = t.geo.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    t.geo.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.mat.opacity = 0.9;
    t.timer = TRACER_TIME;
    const scale = def.id === 'shotgun' ? 1.6 : def.id === 'ar' ? 1.2 : 1;
    flash.scale.setScalar(scale);
    flash.position.copy(from);
    flash.visible = true;
    flashMat.opacity = 1;
    flashTimer = FLASH_TIME;
  }

  /** Burst one pooled spark at a point, its shards flying out. */
  function burstSpark(point) {
    const s = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % MAX_SPARKS;
    s.group.position.copy(point);
    for (const shard of s.shards) {
      shard.mesh.position.set(0, 0, 0);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2.5 + Math.random() * 3;
      shard.vx = Math.cos(a) * Math.cos(b) * speed;
      shard.vy = Math.abs(Math.sin(b)) * speed + 1.5;
      shard.vz = Math.sin(a) * Math.cos(b) * speed;
    }
    s.group.visible = true;
    s.mat.opacity = 1;
    s.timer = SPARK_TIME;
  }

  /** Walk up from the mesh that was hit to find what it belongs to. */
  function classifyHit(object) {
    let node = object;
    while (node) {
      if (node.userData.dummy) return { kind: 'dummy', npc: null };
      if (node.userData.policeCar) return { kind: 'police', npc: null };
      if (node.userData.helicopter) return { kind: 'heli', npc: null };
      if (node.userData.npc) return { kind: 'npc', npc: node.userData.npc };
      node = node.parent;
    }
    return { kind: null, npc: null };
  }

  function currentDef() {
    return WEAPON_DEFS[SLOT_ORDER[slot - 1]];
  }

  return {
    /** The gun table (the test harness reads the tuned numbers off it). */
    get defs() { return WEAPON_DEFS; },
    /** The selected weapon slot: 1 Fists, 2 Pistol, 3 SMG, 4 Shotgun, 5 AR. */
    get slot() { return slot; },
    /** The selected weapon's id ('pistol', 'smg', ...). */
    get weaponId() { return currentDef().id; },
    /** The selected weapon's name, shown on the HUD. */
    get weaponName() { return currentDef().name; },
    /** The selected weapon's category, shown on the HUD. */
    get weaponType() { return currentDef().type; },
    /** True while the selected gun is full-auto (SMG, AR). */
    get auto() { return currentDef().auto; },
    /** Rounds left in the magazine ('∞' for the fists). */
    get mag() { return slot === 1 ? '∞' : state[currentDef().id].mag; },
    /** Spare rounds in reserve ('∞' for the fists). */
    get reserve() { return slot === 1 ? '∞' : state[currentDef().id].reserve; },
    /** True while a reload is running. */
    get reloading() { return reloading; },
    /** Trigger pulls that left the muzzle, all guns. */
    get shotsFired() { return shotsFired; },
    /** Pulls that landed on the dummy, a patrol car, the heli or a pedestrian. */
    get hits() { return hits; },
    /** Pulls that landed on the practice dummy alone. */
    get dummyHits() { return dummyHits; },
    /** Summed pellet damage dealt (the test harness reads it). */
    get damageDealt() { return damageDealt; },
    /** Damage of the most recent pull. */
    get lastDamage() { return lastDamage; },
    /** Pellets of the most recent pull that landed on something hittable. */
    get lastPelletsHit() { return lastPelletsHit; },
    /** Which gun the most recent pull used. */
    get lastShotWeapon() { return lastShotWeapon; },
    /** Where the last pull landed, x (a scare for pedestrians nearby). */
    get shotX() { return shotX; },
    /** Where the last pull landed, z. */
    get shotZ() { return shotZ; },
    /** Spread grown by holding the trigger (0 when the trigger is up). */
    get bloom() { return bloom; },
    /** Tracers lit right now (never more than the pool holds). */
    get activeTracers() { return tracers.filter((t) => t.timer > 0).length; },
    /** Which guns Raka owns, by id. */
    get owned() {
      return Object.keys(state).filter((id) => state[id].owned);
    },
    /** True when Raka owns the named gun. */
    owns(id) { return Boolean(state[id] && state[id].owned); },
    /** The pickups: weapon, spot, taken, and whether the rifle's cache is open. */
    get pickups() {
      return pickups.map((p) => ({
        weapon: p.weapon, x: p.x, z: p.z, taken: p.taken,
        locked: p.needsJobs > 0 && (jobsDone ? jobsDone() : 0) < p.needsJobs,
        needsJobs: p.needsJobs,
      }));
    },
    /** Damage multiplier for a pellet of a gun that flew `dist` metres. */
    falloffFor(id, dist) { return falloffFor(WEAPON_DEFS[id], dist); },

    /**
     * Give Raka a gun at once (a pickup, or the test harness): he owns it
     * with a full magazine and its starting reserve, and it becomes the
     * selected weapon. Giving a gun he already owns tops its reserve up.
     */
    give(id) {
      const def = WEAPON_DEFS[id];
      if (!def || id === 'fists') return false;
      const st = state[id];
      if (!st.owned) {
        st.owned = true;
        st.mag = def.magSize;
        st.reserve = def.reserveStart;
      } else {
        st.reserve = Math.min(def.reserveMax, st.reserve + def.reserveStart);
      }
      slot = def.slot;
      reloading = false;
      reloadTimer = 0;
      return true;
    },

    /**
     * Swap weapons: 1 fists, 2 pistol, 3 SMG, 4 shotgun, 5 AR. A gun
     * Raka does not own yet cannot be selected. A reload in progress is
     * dropped when he puts the gun away.
     */
    selectSlot(next) {
      if (next < 1 || next > 5) return false;
      if (next === slot) return false;
      const id = SLOT_ORDER[next - 1];
      if (!state[id].owned) return false;
      slot = next;
      reloading = false;
      reloadTimer = 0;
      bloom = 0;
      return true;
    },

    /**
     * Step to the next (dir +1) or previous (dir -1) OWNED weapon, as the
     * mouse wheel does. The fists count: the wheel cycles all five slots
     * he owns, in order.
     */
    cycleSlot(dir) {
      const ownedSlots = SLOT_ORDER
        .map((id, i) => ({ id, i: i + 1 }))
        .filter((s) => state[s.id].owned)
        .map((s) => s.i);
      if (ownedSlots.length <= 1) return false;
      let at = ownedSlots.indexOf(slot);
      at = (at + (dir > 0 ? 1 : -1) + ownedSlots.length) % ownedSlots.length;
      slot = ownedSlots[at];
      reloading = false;
      reloadTimer = 0;
      bloom = 0;
      return true;
    },

    /**
     * Fire one trigger pull with the selected gun, if the magazine is not
     * empty, the reload is not running and the cooldown has passed.
     * `aiming` says whether Raka holds right mouse: an aimed round flies
     * nearly true, a hip-fired one wobbles. The shotgun throws eight
     * pellets on a wide cone; the SMG's spread grows while the trigger
     * stays down and resets when it lifts; the rifle stays tight while
     * aimed and climbs with sustained fire. Every pellet is its own ray:
     * the dummy, a patrol car, the helicopter or a pedestrian counts as
     * a hit (a patrol car hit or a pedestrian hit is a crime, so the heat
     * goes up a star); anything else just sparks. The landing point is
     * kept, so the game loop can scare the pedestrians standing near it.
     */
    shoot(aiming = false) {
      if (slot === 1) return false;
      const def = currentDef();
      const st = state[def.id];
      if (reloading || cooldown > 0 || st.mag <= 0) return false;
      st.mag -= 1;
      shotsFired += 1;
      cooldown = def.cooldown;
      lastShotWeapon = def.id;
      triggerHeld = true;
      bloom = Math.min(def.bloomMax, bloom + def.bloom);
      hero.aim(true);

      muzzlePosition(muzzle);
      const baseSpread = (aiming ? def.aimSpread : def.hipSpread) + bloom;
      let pullDamage = 0;
      let pelletsHit = 0;
      let pullLanded = false;
      let firstHitKind = null;
      let firstNpc = null;
      let farX = muzzle.x;
      let farZ = muzzle.z;
      for (let p = 0; p < def.pellets; p += 1) {
        forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
        const wobble = Math.random() * Math.PI * 2;
        forward.x += Math.cos(wobble) * baseSpread;
        forward.z += Math.sin(wobble) * baseSpread;
        forward.y += (Math.random() * 2 - 1) * baseSpread;
        forward.normalize();
        raycaster.set(muzzle, forward);
        raycaster.far = def.range;
        const found = raycaster.intersectObjects(scene.children, true);
        const hit = found.length > 0 ? found[0] : null;
        hitPoint.copy(hit ? hit.point : muzzle.clone().addScaledVector(forward, def.range));
        if (p === 0) { farX = hitPoint.x; farZ = hitPoint.z; }
        showShot(muzzle, hitPoint, def);
        burstSpark(hitPoint);
        if (hit) {
          const dist = hit.distance;
          const { kind, npc } = classifyHit(hit.object);
          if (kind === 'dummy' || kind === 'police' || kind === 'npc' || kind === 'heli') {
            const dmg = def.damage * falloffFor(def, dist);
            pullDamage += dmg;
            pelletsHit += 1;
            pullLanded = true;
            if (!firstHitKind) { firstHitKind = kind; firstNpc = npc; }
          }
        }
      }
      shotX = farX;
      shotZ = farZ;
      lastDamage = pullDamage;
      lastPelletsHit = pelletsHit;
      damageDealt += pullDamage;
      if (pullLanded) {
        hits += 1;
        if (firstHitKind === 'dummy') dummyHits += 1;
        if (firstHitKind === 'police') police.noteShooting();
        if (firstHitKind === 'npc' && firstNpc) {
          police.noteAssault();
          firstNpc.fleeFrom(muzzle.x, muzzle.z);
          if (onCrime) onCrime(shotX, shotZ);
        }
        if (onHit) onHit();
      }
      // Every pull, hit or miss, can scare the street: the pedestrians
      // standing near where it landed run away from it.
      if (onShot) onShot(shotX, shotZ);
      return true;
    },

    /** Tell the system the trigger is up (the bloom bleeds off). */
    releaseTrigger() {
      triggerHeld = false;
    },

    /** Start a reload, if the magazine is short and the reserve is not dry. The fists never reload. */
    reload() {
      if (slot === 1) return false;
      const def = currentDef();
      const st = state[def.id];
      if (reloading || st.mag >= def.magSize || st.reserve <= 0) return false;
      reloading = true;
      reloadTimer = def.reloadTime;
      return true;
    },

    /**
     * Stage the shooting screenshot: one pull already fired at the dummy,
     * its tracer and flash held on the frame (they do not fade while the
     * scene is frozen), the magazine one pull down.
     */
    stageShoot() {
      if (slot === 1) slot = 2;
      const def = currentDef();
      const st = state[def.id];
      if (st.mag === def.magSize) {
        st.mag -= 1;
        shotsFired += 1;
        hits += 1;
      }
      hero.aim(true);
      muzzlePosition(muzzle);
      forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
      hitPoint.set(0, 1.45, 2); // the dummy's red centre
      showShot(muzzle, hitPoint, def);
      burstSpark(hitPoint);
      // Held on the frame: the staged pull never fades.
      for (const t of tracers) if (t.timer > 0) t.timer = 999;
      flashTimer = 999;
      for (const s of sparks) if (s.timer > 0) s.timer = 999;
    },

    /** Refill the loadout (a fresh start after BUSTED or WASTED). */
    reset() {
      slot = 2;
      cooldown = 0;
      reloading = false;
      reloadTimer = 0;
      bloom = 0;
      triggerHeld = false;
      for (const def of Object.values(WEAPON_DEFS)) {
        if (def.id === 'fists') continue;
        state[def.id].mag = def.magSize;
        state[def.id].reserve = def.reserveStart;
      }
      flash.visible = false;
      for (const t of tracers) { t.line.visible = false; t.timer = 0; }
      for (const s of sparks) { s.group.visible = false; s.timer = 0; }
      hero.aim(false);
    },

    /** Save the owned guns and their ammo (the save file keeps them). */
    saveState() {
      const out = {};
      for (const [id, st] of Object.entries(state)) {
        out[id] = { owned: st.owned, mag: st.mag, reserve: st.reserve };
      }
      out.slot = slot;
      return out;
    },

    /** Put a save's guns back (a gun the save never owned stays locked). */
    restoreState(saved) {
      if (!saved) return;
      for (const [id, st] of Object.entries(state)) {
        const s = saved[id];
        if (!s) continue;
        st.owned = Boolean(s.owned);
        st.mag = s.mag ?? WEAPON_DEFS[id].magSize;
        st.reserve = s.reserve ?? WEAPON_DEFS[id].reserveStart;
      }
      const next = saved.slot ?? 2;
      slot = state[SLOT_ORDER[next - 1]]?.owned ? next : 2;
      reloading = false;
      reloadTimer = 0;
      bloom = 0;
    },

    /**
     * Advance the timers: cooldown, reload, flash, tracers, sparks. The
     * bloom bleeds off while the trigger is up. A pickup within reach is
     * taken — the rifle's cache stays shut until three side jobs are
     * done — and the floating guns bob and turn.
     */
    update(dt) {
      const timeSec = (elapsed += dt); // the pickups bob on this clock
      cooldown = Math.max(0, cooldown - dt);
      if (!triggerHeld && bloom > 0) bloom = Math.max(0, bloom - dt * 0.09);
      if (reloading) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const def = currentDef();
          const st = state[def.id];
          const need = def.magSize - st.mag;
          const take = Math.min(need, st.reserve);
          st.mag += take;
          st.reserve -= take;
          reloading = false;
        }
      }
      if (flashTimer > 0 && flashTimer < 900) {
        flashTimer = Math.max(0, flashTimer - dt);
        flashMat.opacity = flashTimer / FLASH_TIME;
        if (flashTimer === 0) flash.visible = false;
      }
      for (const t of tracers) {
        if (t.timer > 0 && t.timer < 900) {
          t.timer = Math.max(0, t.timer - dt);
          t.mat.opacity = 0.9 * (t.timer / TRACER_TIME);
          if (t.timer === 0) t.line.visible = false;
        }
      }
      for (const s of sparks) {
        if (s.timer > 0 && s.timer < 900) {
          s.timer = Math.max(0, s.timer - dt);
          s.mat.opacity = s.timer / SPARK_TIME;
          for (const shard of s.shards) {
            shard.mesh.position.x += shard.vx * dt;
            shard.mesh.position.y += shard.vy * dt;
            shard.mesh.position.z += shard.vz * dt;
            shard.vy -= 6 * dt;
          }
          if (s.timer === 0) s.group.visible = false;
        }
      }
      // The pickups bob and turn; a close one is taken.
      const hx = hero.group.position.x;
      const hz = hero.group.position.z;
      for (const p of pickups) {
        if (p.taken) continue;
        p.gun.position.y = 0.95 + Math.sin(timeSec * 2 + p.x) * 0.08;
        p.gun.rotation.y += dt * 0.8;
        const pulse = 0.45 + Math.sin(timeSec * 3) * 0.15;
        p.ring.material.opacity = pulse;
        const locked = p.needsJobs > 0 && (jobsDone ? jobsDone() : 0) < p.needsJobs;
        if (locked) continue;
        const d = Math.hypot(hx - p.x, hz - p.z);
        if (d > PICKUP_RANGE) continue;
        p.taken = true;
        p.group.visible = false;
        this.give(p.weapon);
        if (onPickup) onPickup(WEAPON_DEFS[p.weapon].name);
      }
    },
  };
}
