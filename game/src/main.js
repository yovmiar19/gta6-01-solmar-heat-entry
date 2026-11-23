// SOLMAR HEAT, step 5 — the entrypoint. It builds the renderer, the city,
// Raka, his Sunset GT and the third-person camera, then runs the loop: on
// foot, read the input, move Raka camera-relative and chase him; near a ride,
// E gets him in, and driving switches to arcade car controls with the camera
// easing in behind it. E again, stopped, gets him back out beside it. The
// street has pedestrians who walk the sidewalks and run when provoked, and
// civilian rides Raka can steal — sedans, a motorbike, a truck and a bus —
// and taking one is a crime, so the heat goes up a star. On foot a click
// fires his Pistol and R reloads it; holding right mouse aims — the camera
// zooms in, a crosshair appears and the rounds fly truer, and Raka turns
// to face where the camera looks so the crosshair tells the truth. His
// health and stamina and the weapon readouts ride on the HUD, and while
// driving the HUD names the ride he is in. With ?shot=chase|street|closeup|drive|shoot&seed=7 in the URL it stages
// one deterministic screenshot scene instead and holds the frame.

import { createWorld } from './world.js';
import { createProtagonist } from './character.js';
import { createCar } from './car.js';
import { createPolice } from './police.js';
import { createTraffic } from './traffic.js';
import { createCombat } from './combat.js';
import { createVitals } from './vitals.js';
import { createChaseCamera } from './camera.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createRadar } from './radar.js';
import { createMissions } from './missions.js';
import { createEnvironment } from './environment.js';
import { createWater } from './water.js';
import { stageShot } from './shots.js';

const WALK_SPEED = 3.2; // metres per second
const RUN_SPEED = 5.8;
const SWIM_SPEED = 2.2; // a steady crawl, metres per second
const FAST_SWIM_SPEED = 4.2; // sprint-swimming on Shift
const DROWN_GRACE = 5; // seconds of warning before an exhausted swimmer goes under
const ENTER_RANGE = 4; // how close Raka must be to get in the car
const FOOT_CAM_DISTANCE = 5.5;
const CAR_CAM_DISTANCE = 8.5;
const SPEED_LIMIT = 14; // metres per second, about 50 km/h: over it is a crime
const BUSTED_HOLD = 2.5; // seconds the BUSTED screen stays up before respawn
const WASTED_HOLD = 2.5; // seconds the WASTED screen stays up before respawn
const FOV_NORMAL = 60; // the camera's field of view, in degrees
const FOV_AIM = 40; // the zoomed-in field of view while Raka aims

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot');

// --- renderer ---------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

// --- the city, the hero, the car, the camera, the input, the HUD ------------
const world = createWorld(scene, seed);
const hero = createProtagonist();
hero.group.position.set(0, 0, 10);
hero.face(Math.PI); // north, up the main avenue into the city
hero.group.rotation.y = Math.PI;
scene.add(hero.group);

const car = createCar();
car.group.position.set(2.2, 0, 4.5); // parked on the avenue, ahead of Raka
car.setHeading(Math.PI); // facing north, up the avenue
scene.add(car.group);

const police = createPolice(scene, world);
const traffic = createTraffic(scene, world, police);
const env = createEnvironment(scene, world); // step 8: day-night, weather, lights
const water = createWater(scene, world); // step 9: beach, sea, boats, swim

const chase = createChaseCamera(camera);
const hud = createHud();
const radar = createRadar();
const missions = createMissions(scene);
const vitals = createVitals();
const combat = createCombat(scene, hero, police, () => hud.showHit(), (x, z) => traffic.noteShot(x, z));
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));

// --- driving state ----------------------------------------------------------
let driving = false;
let speed = 0; // Raka's ground speed on foot, smoothed toward the target
let vehicle = null; // the ride Raka is driving (his Sunset GT or a stolen one)
let vehicleName = 'Sunset GT'; // the ride's name, shown on the HUD
let ridingBike = false; // true while Raka rides the motorbike in the open
let ridingBoat = false; // true while Raka stands at a boat's helm, in the open
let aiming = false; // true while Raka holds right mouse on foot (aim mode)
// Step 9: drowning — out of stamina in deep water, a 5-second grace to
// swim back before he goes under and washes back up on the beach.
let drowned = false; // the WASTED that just happened was a drowning
let drownTimer = 0; // seconds of grace left while exhausted in deep water

// --- busted state -----------------------------------------------------------
// A patrol car pinned Raka: controls freeze, the BUSTED screen goes up, and
// after a beat he is hauled back to the start with the heat cleared.
let busted = false;
let bustedTimer = 0;
let lastVehicleHits = 0; // the vehicle.hits count the last crime check saw

function startBusted() {
  busted = true;
  bustedTimer = 0;
  hud.showBusted(true);
}

// WASTED: Raka's health ran out. Controls freeze, the WASTED screen goes up,
// and after a beat he is patched up and back at the start, full health.
let wasted = false;
let wastedTimer = 0;

function startWasted() {
  wasted = true;
  wastedTimer = 0;
  hud.showWasted(true);
}

function respawn() {
  driving = false;
  ridingBike = false;
  ridingBoat = false;
  aiming = false;
  chase.setTargetFov(FOV_NORMAL);
  hud.setAiming(false);
  vehicle = null;
  vehicleName = 'Sunset GT';
  car.halt();
  car.group.position.set(2.2, 0, 4.5);
  car.setHeading(Math.PI);
  // Step 9: a drowning washes Raka back up on the beach, not the avenue.
  const spawn = drowned ? water.beachSpawn : { x: 0, z: 10 };
  hero.group.position.set(spawn.x, 0, spawn.z);
  hero.group.visible = true;
  hero.face(Math.PI);
  hero.group.rotation.y = Math.PI;
  speed = 0;
  drowned = false;
  drownTimer = 0;
  hud.showDrownWarning(false);
  lastVehicleHits = car.hits;
  police.reset();
  traffic.reset();
  water.reset();
  missions.reset();
  vitals.reset();
  combat.reset();
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setWanted(0);
  hud.showBusted(false);
  hud.showWasted(false);
  hud.setPrompt(null);
  hud.setMission(null, null);
  hud.setCash(missions.cash);
  busted = false;
  bustedTimer = 0;
  wasted = false;
  wastedTimer = 0;
}

/** The nearest ride Raka can get into: his Sunset GT, a civilian one, or a boat. */
function nearestRide() {
  const hx = hero.group.position.x;
  const hz = hero.group.position.z;
  let best = null;
  let bestDist = ENTER_RANGE;
  const dCar = Math.hypot(hx - car.group.position.x, hz - car.group.position.z);
  if (dCar < bestDist) { best = car; bestDist = dCar; }
  const t = traffic.nearestEnterable(hx, hz, ENTER_RANGE);
  if (t && t.dist < bestDist) { best = t.vehicle; bestDist = t.dist; }
  // Step 9: the boats moor off the beach — close enough to wade out to.
  const b = water.nearestBoat(hx, hz, ENTER_RANGE);
  if (b && b.dist < bestDist) { best = b.vehicle; bestDist = b.dist; }
  return best;
}

function enterVehicle(ride) {
  driving = true;
  vehicle = ride;
  vehicleName = ride.name ?? 'Sunset GT';
  lastVehicleHits = ride.hits;
  // Taking a civilian ride is theft: the heat goes up a star, and a
  // self-driving sedan stops cruising once it is Raka's.
  if (ride.steal) {
    ride.stolen = true;
    police.noteTheft();
  }
  // A motorbike has no cabin: Raka stays visible, seated on it (see the
  // driving branch, which puts him on the seat every frame). A boat is open
  // too: he stands at the helm, in the open, turning with it. Every other
  // ride hides him inside, as before.
  if (ride.type === 'Motorbike') {
    ridingBike = true;
    ridingBoat = false;
    hero.group.visible = true;
  } else if (ride.type === 'Boat') {
    ridingBoat = true;
    ridingBike = false;
    hero.group.visible = true;
    hero.stand(); // limbs neutral at the helm (the walk pose must not follow him)
  } else {
    ridingBike = false;
    ridingBoat = false;
    hero.group.visible = false;
  }
  chase.setDistance(ride.camDistance ?? CAR_CAM_DISTANCE);
  hud.setPrompt(null);
}

function exitVehicle() {
  driving = false;
  ridingBike = false;
  ridingBoat = false;
  vehicle.halt();
  speed = 0;
  // Step out beside the ride (its right side) and face the way it was going.
  // Off a boat he steps out into the water, so the south clamp is the far
  // edge of the bay, not the city line (which would teleport him ashore).
  const zMax = vehicle.type === 'Boat' ? water.seaMaxZ : world.bounds;
  const rightX = Math.cos(vehicle.yaw);
  const rightZ = -Math.sin(vehicle.yaw);
  hero.group.position.set(
    Math.max(-world.bounds, Math.min(world.bounds, vehicle.group.position.x + rightX * 2.4)),
    0,
    Math.max(-world.bounds, Math.min(zMax, vehicle.group.position.z + rightZ * 2.4)),
  );
  hero.group.visible = true;
  hero.stand(); // limbs back to neutral (a rider's bent pose must not follow him on foot)
  hero.face(vehicle.yaw);
  vehicle = null;
  vehicleName = 'Sunset GT';
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setPrompt(null);
}

/** The radar's inputs: Raka, the heat, the street, the boats and the mission target. */
function radarState() {
  return {
    x: hero.group.position.x,
    z: hero.group.position.z,
    yaw: hero.yaw,
    police: police.patrolPositions,
    heli: police.heliPos,
    vehicles: traffic.vehicles,
    boats: water.boats,
    npcs: traffic.npcs,
    sunset: { x: car.group.position.x, z: car.group.position.z },
    target: missions.target,
    time: performance.now() / 1000,
  };
}

// A screenshot scene freezes the pose and holds the frame; play mode moves.
const shotFocus = shotName ? stageShot(shotName, hero, chase, car, police, traffic) : null;
const frozen = shotFocus !== null;
if (frozen) {
  // The HUD reads for the staged frame: the drive shot shows the car rolling,
  // the pursuit shot shows the chase at 3 wanted stars, the shoot shot shows
  // Raka aiming with one round already down the range (11 in the magazine).
  if (shotName === 'drive') {
    hud.updateDriving(11); // about 40 km/h, mid-avenue
    hud.setPrompt(null);
  } else if (shotName === 'pursuit') {
    hud.updateDriving(11); // about 40 km/h, fleeing the patrol cars
    hud.setWanted(3);
    hud.setPrompt(null);
  } else if (shotName === 'shoot') {
    combat.stageShoot(); // tracer held on the frame, magazine 11 / 24
    hud.updateFoot(0, false, false);
    hud.setPrompt(null);
  } else if (shotName === 'mission') {
    // The Pier Run is in progress: its gold marker stands at the north
    // end of the avenue, the radar shows the target diamond, and the
    // mission panel names the job. Raka stands on foot below the marker.
    missions.stageMissionShot();
    hud.updateFoot(0, false, false);
    hud.setMission('Pier Run', 'Drive to the pier drop-off at the north end');
    hud.setCash(missions.cash);
    hud.setPrompt(null);
  } else {
    hud.updateFoot(0, false, false);
    hud.setPrompt(null);
  }
  hud.setHealth(vitals.health, vitals.maxHealth);
  hud.setStamina(vitals.stamina, vitals.maxStamina);
  hud.setWeapon(combat.weaponName, combat.weaponType, combat.mag, combat.reserve, combat.reloading);
}

// --- movement ----------------------------------------------------------------
function step(dt) {
  world.update(dt);
  // Step 8: C turns the weather (clear → rain → fog → storm), T jumps the
  // clock two hours ahead. Both work on foot and behind the wheel. They run
  // before the sky update, so the HUD clock reads the jumped time at once.
  if (input.takeWeather()) env.cycleWeather();
  if (input.takeTime()) env.advanceTime(2);
  // Step 8: the sky turns (the clock runs, the weather may turn) and the
  // HUD clock reads it. A staged screenshot frame holds the light still:
  // frozen frames never advance the clock or turn the weather.
  env.update(dt, {
    player: { x: hero.group.position.x, z: hero.group.position.z },
    driven: driving ? vehicle : null,
    frozen,
  });
  hud.setClock(env.hours, env.phase, env.weather);
  // Step 9: the waves roll and the parked boats bob (a staged screenshot
  // frame holds the sea still, like it holds the sky).
  water.update(dt, {
    driven: driving && vehicle && vehicle.type === 'Boat' ? vehicle : null,
    frozen,
  });
  if (frozen) {
    // Hold the staged frame: camera exactly on its spot. The radar still
    // draws (it is part of the frame) and the markers still pulse.
    chase.update(dt, shotFocus, true);
    radar.update(radarState());
    missions.pulse(dt);
    return;
  }

  // Busted: the controls are frozen and the overlay is up; after a beat the
  // game hauls Raka back to the start with the heat cleared.
  if (busted) {
    bustedTimer += dt;
    if (bustedTimer >= BUSTED_HOLD) respawn();
    return;
  }

  // Wasted: the same freeze, on the WASTED screen; after a beat he is patched
  // up and back at the start with full health.
  if (wasted) {
    wastedTimer += dt;
    if (wastedTimer >= WASTED_HOLD) respawn();
    return;
  }

  if (driving) {
    // --- behind the wheel ---------------------------------------------------
    // Aim is a on-foot thing: behind the wheel the zoom and the crosshair
    // stay off even if the right button is still held.
    aiming = false;
    chase.setTargetFov(FOV_NORMAL);
    hud.setAiming(false);
    vehicle.update(dt, input, world);
    // On a motorbike Raka rides in the open: seat him on it — hips on the
    // seat (local z -0.5, y 0.07 so his hips sit on the seat top), facing
    // the way it goes, so he turns and leans with the bike.
    if (ridingBike) {
      hero.group.position.set(
        vehicle.group.position.x - Math.sin(vehicle.yaw) * 0.5,
        0.07,
        vehicle.group.position.z - Math.cos(vehicle.yaw) * 0.5,
      );
      hero.ride(vehicle.yaw);
    }
    // On a boat Raka stands at the helm in the open, riding the swell with it.
    if (ridingBoat) {
      hero.group.position.set(
        vehicle.group.position.x,
        vehicle.group.position.y + 0.1,
        vehicle.group.position.z,
      );
      hero.group.rotation.y = vehicle.yaw;
    }
    // The camera eases in BEHIND the ride: its yaw is the car's heading
    // plus half a turn, so it sits on the side opposite to where the car
    // faces and looks the way the car is going. (The car's yaw is the
    // direction it faces; the camera's yaw is the direction from the car
    // to the camera — the same number would park the camera in FRONT of
    // the car, looking back at it.)
    chase.yawToward(vehicle.yaw + Math.PI, dt);
    chase.update(dt, vehicle.group.position, false);
    hud.updateDriving(vehicle.speed, vehicleName);
    hud.setPrompt(Math.abs(vehicle.speed) < 1 ? 'Press E to get out' : null);
    if (input.takeAction() && Math.abs(vehicle.speed) < 1) exitVehicle();
  } else {
    // --- on foot -------------------------------------------------------------
    const f = input.forward;
    const s = input.strafe;
    const moving = input.moving;
    // Step 9: the water — ankle-deep wading is slow, waist-deep slower,
    // and past the swim line Raka swims (a crawl stroke, head above the
    // water). Shift is a fast swim, and it spends stamina like a run.
    const depth = water.depthAt(hero.group.position.x, hero.group.position.z);
    const swimming = depth > 1.2;
    const wading = !swimming && depth > 0.3;
    const fastSwim = swimming && input.running && vitals.canRun;
    // Running needs stamina: run dry and he is winded, walking only until
    // it has come back a little. Treading water exhausted spends stamina
    // the same way and never lets it come back while he is still deep.
    const running = input.running && vitals.canRun;
    const exhaustedSwim = swimming && vitals.stamina <= 0;
    vitals.update(dt, (running && moving) || (fastSwim && moving) || exhaustedSwim);

    // Out of stamina in deep water: a 5-second grace to swim back to the
    // shallows (the warning counts it down), then he goes under.
    if (exhaustedSwim) {
      drownTimer += dt;
      hud.showDrownWarning(true, DROWN_GRACE - drownTimer);
      if (drownTimer >= DROWN_GRACE) {
        drowned = true;
        vitals.damage(100);
      }
    } else {
      drownTimer = 0;
      hud.showDrownWarning(false);
    }

    // Camera-relative move direction on the ground.
    const forward = chase.forward();
    const right = chase.right();
    let moveX = forward.x * f + right.x * s;
    let moveZ = forward.z * f + right.z * s;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) { moveX /= length; moveZ /= length; }

    // Ease toward the target speed (walk, run, wade, swim, or stop).
    const target = !moving ? 0
      : swimming ? (fastSwim ? FAST_SWIM_SPEED : SWIM_SPEED)
      : wading ? (running ? RUN_SPEED * 0.5 : WALK_SPEED * 0.5)
      : (running ? RUN_SPEED : WALK_SPEED);
    speed += (target - speed) * Math.min(1, dt * 8);
    if (speed < 0.05) speed = 0;

    if (moving && speed > 0.05) {
      hero.group.position.x += moveX * speed * dt;
      hero.group.position.z += moveZ * speed * dt;
      // Stay inside the city — and the bay, south to the far edge of the sea.
      hero.group.position.x = Math.max(-world.bounds, Math.min(world.bounds, hero.group.position.x));
      hero.group.position.z = Math.max(-world.bounds, Math.min(water.seaMaxZ, hero.group.position.z));
      // Face where he moves.
      hero.face(Math.atan2(moveX, moveZ));
    }

    if (swimming) {
      // Head above the water, bobbing on the swell; the crawl replaces the walk.
      hero.group.position.y = -0.75 + Math.sin(performance.now() / 1000 * 2) * 0.05;
      hero.swim(dt, fastSwim);
      hud.updateSwim(speed, fastSwim);
    } else {
      hero.group.position.y = 0;
      hero.update(dt, speed, moving);
      hud.updateFoot(speed, moving, running);
    }
    chase.update(dt, hero.group.position, false);

    // --- aim: hold right mouse and Raka bids down the sights ----------------
    // The camera zooms in, the crosshair comes up, and Raka turns to face
    // where the camera looks, so a round goes where the crosshair points.
    // (The camera's yaw is the direction from Raka to the camera, so the
    // way he must face is the camera's yaw plus half a turn.) No aiming or
    // shooting while swimming: both hands are busy staying afloat.
    aiming = swimming ? false : input.aiming;
    if (aiming) hero.face(chase.yaw + Math.PI);
    chase.setTargetFov(aiming ? FOV_AIM : FOV_NORMAL);
    hud.setAiming(aiming);

    // --- the Pistol: a click fires, R reloads --------------------------------
    // A round landing near a pedestrian scares them into running (the combat
    // rig tells the street where it landed, through its onShot callback).
    // An aimed round flies nearly true; a hip-fired one wobbles a little.
    if (!swimming && input.takeShot()) combat.shoot(aiming);
    if (!swimming && input.takeReload()) combat.reload();

    // --- a ride: near one, E gets in -----------------------------------------
    const ride = nearestRide();
    hud.setPrompt(ride ? (ride.prompt ?? 'Press E to enter the Sunset GT') : null);
    if (input.takeAction() && ride) enterVehicle(ride);
  }

  // --- combat timers (cooldown, reload, tracer, flash, spark) ---------------
  combat.update(dt);
  // The aim pose holds while Raka aims, and for a beat after a hip-fired
  // round; otherwise it drops. (Applied after the combat timers, so a
  // shot's pose timer expiring cannot drop the pose mid-aim.)
  hero.aim(aiming || combat.aiming);

  // --- the survival readouts: health, stamina, weapon, bullets --------------
  hud.setHealth(vitals.health, vitals.maxHealth);
  hud.setStamina(vitals.stamina, vitals.maxStamina);
  hud.setWeapon(combat.weaponName, combat.weaponType, combat.mag, combat.reserve, combat.reloading);

  // --- the heat: crimes, the chase, the bust --------------------------------
  // Speeding and smashing into buildings earn stars; the patrol cars answer
  // them, and a car that pins Raka ends the run with BUSTED.
  if (driving) {
    // The speed limit is a road rule: a boat at full throttle on open
    // water is not speeding, so it never earns a star for it.
    if (vehicle.type !== 'Boat') police.noteSpeeding(dt, Math.abs(vehicle.speed) > SPEED_LIMIT);
    if (vehicle.hits > lastVehicleHits) {
      lastVehicleHits = vehicle.hits;
      police.noteCollision();
    }
  }
  const player = driving
    ? { x: vehicle.group.position.x, z: vehicle.group.position.z, driving: true, speed: vehicle.speed, car: vehicle, vehicle }
    : { x: hero.group.position.x, z: hero.group.position.z, driving: false, speed, car: null, vehicle: null };
  // --- the street: the cruiser drives itself, pedestrians walk and flee -----
  traffic.update(dt, player, car);
  const damage = police.update(dt, player);
  if (damage > 0) vitals.damage(damage);
  hud.setWanted(police.wanted);
  if (police.busted) startBusted();
  else if (vitals.wasted) startWasted();

  // --- the jobs: start one at the marker, finish one at its target --------
  // A job pays cash and starts the next straight away; the banner calls
  // out each completion and the panel names the job in progress.
  missions.update(dt, {
    x: player.x,
    z: player.z,
    driving,
    vehicle: driving ? vehicle : null,
    wanted: police.wanted,
    dummyHits: combat.dummyHits,
    vehicles: traffic.vehicles,
  });
  const banner = missions.takeBanner();
  if (banner) hud.showMissionBanner(banner);
  hud.setMission(
    missions.active ? missions.active.name : null,
    missions.active ? missions.active.objective : null,
  );
  hud.setCash(missions.cash);

  // --- the radar: Raka, the heat, the street and the mission target --------
  radar.update(radarState());
}

// --- the loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__solmarReady = true; // the test harness waits for this
  }
}
loop();

// A small handle for the play-test: what mode the game is in, and the rigs.
window.__solmar = {
  get driving() { return driving; },
  get heroPos() { return { x: hero.group.position.x, z: hero.group.position.z }; },
  get carPos() { return { x: car.group.position.x, z: car.group.position.z }; },
  get carSpeed() { return car.speed; },
  get wanted() { return police.wanted; },
  get policeCount() { return police.count; },
  get busted() { return busted; },
  get wasted() { return wasted; },
  get health() { return vitals.health; },
  get stamina() { return vitals.stamina; },
  get canRun() { return vitals.canRun; },
  get mag() { return combat.mag; },
  get reserve() { return combat.reserve; },
  get reloading() { return combat.reloading; },
  get weapon() { return { name: combat.weaponName, type: combat.weaponType }; },
  get hits() { return combat.hits; },
  get shotsFired() { return combat.shotsFired; },
  get vehicleName() { return driving ? vehicleName : null; },
  get vehicleType() { return driving ? (vehicle.type ?? 'Car') : null; },
  get ridingBike() { return ridingBike; },
  get heroVisible() { return hero.group.visible; },
  /** True while Raka holds right mouse on foot (aim mode). */
  get aiming() { return aiming; },
  /** The camera's current field of view, in degrees. */
  get fov() { return chase.fov; },
  get heroPos3() {
    return { x: hero.group.position.x, y: hero.group.position.y, z: hero.group.position.z };
  },
  get npcCount() { return traffic.npcCount; },
  get fleeingCount() { return traffic.fleeingCount; },
  get cash() { return missions.cash; },
  get mission() {
    return {
      active: missions.active ? missions.active.name : null,
      objective: missions.active ? missions.active.objective : null,
      cash: missions.cash,
      completed: missions.completedCount,
      target: missions.target,
    };
  },
  get radarPlayer() { return radar.player; },
  get radarTarget() { return radar.target; },
  /** Step 8: the game clock (hours), the weather and how dark it is. */
  get envTime() { return env.hours; },
  get envWeather() { return env.weather; },
  get envPhase() { return env.phase; },
  get envNight() { return env.night; },
  /** Step 8: the lightning flash (1 at a strike, decaying to 0). */
  get envLightning() { return env.lightning; },
  env,
  /** Step 9: true while Raka swims in deep water. */
  get swimming() { return water.depthAt(hero.group.position.x, hero.group.position.z) > 1.2; },
  /** Step 9: the depth of the water where Raka stands (0 on dry land). */
  get waterDepth() { return water.depthAt(hero.group.position.x, hero.group.position.z); },
  /** Step 9: true while the drown warning is counting down. */
  get drowning() { return drownTimer > 0; },
  /** Step 9: true while Raka stands at a boat's helm, in the open. */
  get ridingBoat() { return ridingBoat; },
  /** Step 9: the boats' spots, for the test harness. */
  get boats() {
    return water.boats.map((b) => ({
      name: b.name, x: b.group.position.x, z: b.group.position.z,
      yaw: b.yaw, speed: b.speed, stolen: b.stolen,
    }));
  },
  water,
  get trafficVehicles() {
    return traffic.vehicles.map((v) => ({
      name: v.name, type: v.type,
      x: v.group.position.x, z: v.group.position.z,
      yaw: v.yaw, speed: v.speed, stolen: v.stolen,
    }));
  },
  hero, car, police, vitals, combat, traffic, missions, radar, chase,
  // Test helpers: set the heat at once, put a patrol car beside the player,
  // or force the bust, without waiting for a real crime and chase.
  debug: {
    setWanted(n) { police.setWanted(n); },
    placeNear() {
      const p = driving ? vehicle.group.position : hero.group.position;
      police.placeNear(p.x, p.z);
    },
    forceBust() { police.forceBust(); },
    damage(n) { vitals.damage(n); },
    shoot() { combat.shoot(); },
    reload() { combat.reload(); },
    /** Put Raka beside the named ride (Motor, Truk, Bus, Sedan). */
    toVehicle(name) {
      const v = traffic.vehicles.find((ride) => ride.name === name);
      if (!v) return false;
      hero.group.position.set(v.group.position.x + 2.4, 0, v.group.position.z);
      hero.group.visible = true;
      hero.face(Math.atan2(v.group.position.x - hero.group.position.x, v.group.position.z - hero.group.position.z));
      return true;
    },
    /** Enter the nearest ride at once, as if Raka pressed E. */
    enter() {
      const ride = nearestRide();
      if (ride) enterVehicle(ride);
      return ride ? (ride.name ?? 'Sunset GT') : null;
    },
    /** Put the nearest pedestrian a step ahead of Raka, facing him. */
    npcNear() {
      let best = null;
      let bestDist = Infinity;
      for (const npc of traffic.npcs) {
        const d = Math.hypot(
          npc.group.position.x - hero.group.position.x,
          npc.group.position.z - hero.group.position.z,
        );
        if (d < bestDist) { best = npc; bestDist = d; }
      }
      if (!best) return false;
      const fx = Math.sin(hero.yaw);
      const fz = Math.cos(hero.yaw);
      best.setPose(hero.group.position.x + fx * 1.5, hero.group.position.z + fz * 1.5, Math.atan2(-fx, -fz));
      return true;
    },
    /** Turn Raka toward the nearest pedestrian, so a shot can reach them. */
    aimNpc() {
      let best = null;
      let bestDist = Infinity;
      for (const npc of traffic.npcs) {
        const d = Math.hypot(
          npc.group.position.x - hero.group.position.x,
          npc.group.position.z - hero.group.position.z,
        );
        if (d < bestDist) { best = npc; bestDist = d; }
      }
      if (!best) return false;
      hero.face(Math.atan2(
        best.group.position.x - hero.group.position.x,
        best.group.position.z - hero.group.position.z,
      ));
      hero.group.rotation.y = hero.yaw;
      return true;
    },
    /** Put Raka on a spot on foot, facing a direction (staging). */
    toPos(x, z, yaw = Math.PI) {
      if (driving) return false;
      hero.group.position.set(x, 0, z);
      hero.face(yaw);
      hero.group.rotation.y = yaw;
      speed = 0;
      return true;
    },
    /** Step 8: jump the game clock to an hour at once (0–24). */
    setTime(h) { env.setTime(h); },
    /** Step 8: set the weather at once ('CLEAR' | 'RAIN' | 'FOG' | 'STORM'). */
    setWeather(name) { return env.setWeather(name); },
    /** Step 8: turn the weather on to the next one. */
    cycleWeather() { return env.cycleWeather(); },
    /** Step 9: put Raka on the beach, facing the sea (south). */
    toBeach() {
      if (driving) return false;
      hero.group.position.set(0, 0, water.beachSpawn.z);
      hero.face(0);
      hero.group.rotation.y = 0;
      speed = 0;
      return true;
    },
    /** Step 9: put Raka in deep water, facing south (out to sea). */
    toWater() {
      if (driving) return false;
      hero.group.position.set(0, 0, 100);
      hero.face(0);
      hero.group.rotation.y = 0;
      speed = 0;
      return true;
    },
    /** Step 9: put Raka beside the named boat ('Speedboat' | 'Fishing Boat'). */
    toBoat(name) {
      if (driving) return false;
      const b = water.boats.find((boat) => boat.name === name);
      if (!b) return false;
      hero.group.position.set(b.group.position.x + 2.4, 0, b.group.position.z);
      hero.group.visible = true;
      hero.face(Math.atan2(
        b.group.position.x - hero.group.position.x,
        b.group.position.z - hero.group.position.z,
      ));
      speed = 0;
      return true;
    },
    /** Step 9: set the stamina at once (the drown check drains it). */
    setStamina(n) { vitals.setStamina(n); },
    /** Put Raka beside the mission start marker, facing it. */
    toMissionStart() {
      if (driving) return false;
      const s = missions.start;
      hero.group.position.set(s.x, 0, s.z + 2.5);
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      speed = 0;
      return true;
    },
    /** Put Raka (or the ride he is driving) beside the active target. */
    toTarget() {
      const t = missions.target;
      if (!t) return false;
      if (driving) {
        vehicle.group.position.set(t.x, 0, t.z + 2);
        vehicle.setHeading(Math.PI);
        vehicle.halt();
      } else {
        hero.group.position.set(t.x, 0, t.z + 2);
        hero.face(Math.PI);
        hero.group.rotation.y = Math.PI;
        speed = 0;
      }
      return true;
    },
    /** Put a pedestrian right ahead of the ride Raka is driving. */
    npcAhead() {
      if (!driving) return false;
      const npc = traffic.npcs.find((n) => !n.fleeing);
      if (!npc) return false;
      const fx = Math.sin(vehicle.yaw);
      const fz = Math.cos(vehicle.yaw);
      npc.setPose(
        vehicle.group.position.x + fx * (vehicle.radius + 3),
        vehicle.group.position.z + fz * (vehicle.radius + 3),
        Math.atan2(-fx, -fz),
      );
      return true;
    },
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
