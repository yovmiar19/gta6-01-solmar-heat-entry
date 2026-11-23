// Step 4 — shooting and combat. Raka carries a Pistol (a Handgun): left
// click fires one round, R reloads the magazine from the reserve. A shot is
// a ray from Raka's chest along the way he faces: it can hit the practice
// dummy on the avenue, a patrol car (shooting the police is a crime, so it
// earns a star), a pedestrian (hitting one is a crime too, so it earns a
// star and makes them run), or a wall, and it always shows a muzzle flash,
// a tracer line and a spark where it lands. Ammo, the hit count and the
// reload state are the HUD's to read; the game loop calls update() every
// frame.

const MAG_SIZE = 12; // rounds in one magazine
const RESERVE_START = 24; // spare rounds Raka starts with
const RESERVE_MAX = 48; // the most spare rounds he can carry
const RELOAD_TIME = 1.2; // seconds a reload takes
const RANGE = 30; // how far a round flies, in metres
const SHOT_COOLDOWN = 0.22; // seconds between rounds
const FLASH_TIME = 0.06; // seconds the muzzle flash shows
const TRACER_TIME = 0.12; // seconds the tracer line lingers
const SPARK_TIME = 0.25; // seconds the impact spark lasts

const FLASH_COLOR = 0xffe9a0;
const TRACER_COLOR = 0xffe9a0;
const SPARK_COLOR = 0xffd23e;

/**
 * Build the combat rig. `scene` is the city, `hero` is Raka's rig (for the
 * muzzle position and the aim pose), `police` is the wanted system (a hit on
 * a patrol car earns a star through noteShooting), `onHit` fires when a
 * round lands on something shootable (the HUD flashes its hit marker), and
 * `onShot` fires after every round that leaves the muzzle, with the landing
 * point (so the street can scare the pedestrians standing near it).
 */
export function createCombat(scene, hero, police, onHit, onShot) {
  // --- the practice dummy: a pole and a ringed board on the avenue ---------
  // It stands 8 metres north of where Raka starts, so a shot straight ahead
  // from the start lands on it. Its meshes carry userData.dummy, so the
  // raycast knows what it hit.
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

  // --- the muzzle flash: a bright crossed pair at the gun's tip ------------
  const flashMat = new THREE.MeshBasicMaterial({
    color: FLASH_COLOR, transparent: true, opacity: 0,
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
  // The shot's own effects must never catch its ray: the raycaster tests
  // every mesh and line in the scene, visible or not, and the tracer lies
  // exactly on the line of fire — without this, every round after the first
  // "hits" its own tracer at the muzzle and never reaches the dummy.
  flashA.raycast = () => {};
  flashB.raycast = () => {};

  // --- the tracer: one line from the muzzle to where the round lands -------
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({
    color: TRACER_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  tracer.raycast = () => {}; // never let a round hit its own tracer
  scene.add(tracer);

  // --- the impact spark: five small shards that burst out and fade ---------
  const sparkMat = new THREE.MeshBasicMaterial({ color: SPARK_COLOR, transparent: true, opacity: 0 });
  const spark = new THREE.Group();
  const shards = [];
  for (let i = 0; i < 5; i += 1) {
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), sparkMat);
    shard.raycast = () => {}; // a burst from the last hit must not stop the next round
    spark.add(shard);
    shards.push({ mesh: shard, vx: 0, vy: 0, vz: 0 });
  }
  spark.visible = false;
  scene.add(spark);

  const raycaster = new THREE.Raycaster();
  const muzzle = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  let mag = MAG_SIZE;
  let reserve = RESERVE_START;
  let reloading = false;
  let reloadTimer = 0;
  let cooldown = 0;
  let flashTimer = 0;
  let tracerTimer = 0;
  let sparkTimer = 0;
  let aimTimer = 0; // seconds the aim pose still holds after a shot
  let hits = 0; // rounds that landed on the dummy, a patrol car or a pedestrian
  let shotsFired = 0;
  let shotX = 0; // where the last round landed (ground point, for scares)
  let shotZ = 0;

  /** Where the round leaves Raka: his chest, a little ahead of his body.
   * Chest height (1.15) matters: the ray is level, so at this height it
   * meets a pedestrian's torso and a car's cabin; any higher and it slips
   * through the gap between a pedestrian's shoulders and head. */
  function muzzlePosition(out) {
    forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    out.copy(hero.group.position);
    out.y = 1.15;
    out.addScaledVector(forward, 0.55);
    return out;
  }

  /** Burst the spark at a point, its shards flying out in all directions. */
  function burstSpark(point) {
    spark.position.copy(point);
    for (const shard of shards) {
      shard.mesh.position.set(0, 0, 0);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2.5 + Math.random() * 3;
      shard.vx = Math.cos(a) * Math.cos(b) * speed;
      shard.vy = Math.abs(Math.sin(b)) * speed + 1.5;
      shard.vz = Math.sin(a) * Math.cos(b) * speed;
    }
    spark.visible = true;
    sparkMat.opacity = 1;
    sparkTimer = SPARK_TIME;
  }

  /** Lay the tracer from the muzzle to a point and light the flash. */
  function showShot(from, to) {
    const positions = tracerGeo.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    tracerGeo.attributes.position.needsUpdate = true;
    tracer.visible = true;
    tracerMat.opacity = 0.9;
    tracerTimer = TRACER_TIME;
    flash.position.copy(from);
    flash.visible = true;
    flashMat.opacity = 1;
    flashTimer = FLASH_TIME;
  }

  return {
    /** The weapon's name, shown on the HUD. */
    weaponName: 'Pistol',
    /** The weapon's category, shown on the HUD. */
    weaponType: 'Handgun',
    /** Rounds left in the magazine. */
    get mag() { return mag; },
    /** Spare rounds in reserve. */
    get reserve() { return reserve; },
    /** True while a reload is running. */
    get reloading() { return reloading; },
    /** Rounds that landed on the dummy, a patrol car or a pedestrian. */
    get hits() { return hits; },
    /** Rounds fired so far. */
    get shotsFired() { return shotsFired; },
    /** Where the last round landed, x (a scare for pedestrians nearby). */
    get shotX() { return shotX; },
    /** Where the last round landed, z (a scare for pedestrians nearby). */
    get shotZ() { return shotZ; },
    /** True while Raka should hold the aim pose (just after a shot). */
    get aiming() { return aimTimer > 0; },

    /**
     * Fire one round, if the magazine is not empty, the reload is not
     * running and the cooldown has passed. The ray decides what it hit:
     * the dummy, a patrol car or a pedestrian counts as a hit (a patrol
     * car hit or a pedestrian hit is a crime, so the heat goes up a star);
     * anything else just sparks. The landing point is kept, so the game
     * loop can scare the pedestrians standing near it.
     */
    shoot() {
      if (reloading || cooldown > 0 || mag <= 0) return false;
      mag -= 1;
      shotsFired += 1;
      cooldown = SHOT_COOLDOWN;
      aimTimer = 0.45;
      hero.aim(true);

      muzzlePosition(muzzle);
      forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
      raycaster.set(muzzle, forward);
      raycaster.far = RANGE;
      const found = raycaster.intersectObjects(scene.children, true);
      const hit = found.length > 0 ? found[0] : null;
      hitPoint.copy(hit ? hit.point : muzzle.clone().addScaledVector(forward, RANGE));
      shotX = hitPoint.x;
      shotZ = hitPoint.z;
      showShot(muzzle, hitPoint);
      burstSpark(hitPoint);

      if (hit) {
        // Walk up from the mesh that was hit to find what it belongs to.
        let node = hit.object;
        let kind = null;
        let npcRig = null;
        while (node) {
          if (node.userData.dummy) { kind = 'dummy'; break; }
          if (node.userData.policeCar) { kind = 'police'; break; }
          if (node.userData.npc) { kind = 'npc'; npcRig = node.userData.npc; break; }
          node = node.parent;
        }
        if (kind === 'dummy' || kind === 'police' || kind === 'npc') {
          hits += 1;
          if (kind === 'police') police.noteShooting();
          if (kind === 'npc') {
            police.noteAssault();
            npcRig.fleeFrom(muzzle.x, muzzle.z);
          }
          if (onHit) onHit();
        }
      }
      // Every round, hit or miss, can scare the street: the pedestrians
      // standing near where it landed run away from it.
      if (onShot) onShot(shotX, shotZ);
      return true;
    },

    /** Start a reload, if the magazine is short and the reserve is not dry. */
    reload() {
      if (reloading || mag >= MAG_SIZE || reserve <= 0) return false;
      reloading = true;
      reloadTimer = RELOAD_TIME;
      return true;
    },

    /**
     * Stage the shooting screenshot: one round already fired at the dummy,
     * its tracer and flash held on the frame (they do not fade while the
     * scene is frozen), the magazine one round down.
     */
    stageShoot() {
      if (mag === MAG_SIZE) {
        mag -= 1;
        shotsFired += 1;
        hits += 1;
      }
      hero.aim(true);
      aimTimer = 999; // hold the aim pose for the frozen frame
      muzzlePosition(muzzle);
      forward.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
      hitPoint.set(0, 1.45, 2); // the dummy's red centre
      showShot(muzzle, hitPoint);
      burstSpark(hitPoint);
      // Held on the frame: the staged shot never fades.
      tracerTimer = 999;
      flashTimer = 999;
      sparkTimer = 999;
    },

    /** Refill the weapon (a fresh start after BUSTED or WASTED). */
    reset() {
      mag = MAG_SIZE;
      reserve = RESERVE_START;
      reloading = false;
      reloadTimer = 0;
      cooldown = 0;
      aimTimer = 0;
      hero.aim(false);
      flash.visible = false;
      tracer.visible = false;
      spark.visible = false;
    },

    /** Advance the timers: cooldown, reload, aim pose, flash, tracer, spark. */
    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      if (aimTimer > 0 && aimTimer < 900) {
        aimTimer = Math.max(0, aimTimer - dt);
        if (aimTimer === 0) hero.aim(false);
      }
      if (reloading) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const need = MAG_SIZE - mag;
          const take = Math.min(need, reserve);
          mag += take;
          reserve -= take;
          reloading = false;
        }
      }
      if (flashTimer > 0 && flashTimer < 900) {
        flashTimer = Math.max(0, flashTimer - dt);
        flashMat.opacity = flashTimer / FLASH_TIME;
        if (flashTimer === 0) flash.visible = false;
      }
      if (tracerTimer > 0 && tracerTimer < 900) {
        tracerTimer = Math.max(0, tracerTimer - dt);
        tracerMat.opacity = 0.9 * (tracerTimer / TRACER_TIME);
        if (tracerTimer === 0) tracer.visible = false;
      }
      if (sparkTimer > 0 && sparkTimer < 900) {
        sparkTimer = Math.max(0, sparkTimer - dt);
        sparkMat.opacity = sparkTimer / SPARK_TIME;
        for (const shard of shards) {
          shard.mesh.position.x += shard.vx * dt;
          shard.mesh.position.y += shard.vy * dt;
          shard.mesh.position.z += shard.vz * dt;
          shard.vy -= 6 * dt;
        }
        if (sparkTimer === 0) spark.visible = false;
      }
    },
  };
}
