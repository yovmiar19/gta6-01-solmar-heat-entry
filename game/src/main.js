// SOLMAR HEAT, step 13 — the entrypoint. It builds the renderer, the city,
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
// driving the HUD names the ride he is in. Esc (or P) pauses the world
// and opens the pause menu — map, story, stats, settings, controls, save —
// and the game saves to three slots in localStorage, plus an autosave
// whenever a mission pays out. T opens the phone — jobs, map, bank,
// texts — and the world freezes behind it, the same as the pause menu.
// The phone's side jobs pay cash, warm up their home district and bank
// RP toward the next rank. With ?shot=chase|street|closeup|drive|shoot&seed=7 in the URL it stages
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
import { createMovement } from './movement.js';
import { createStory } from './story.js';
import { createPause } from './pause.js';
import { createSound } from './sound.js';
import { createDistricts } from './districts.js';
import { createRank, RP_PER_MISSION, RP_PER_JOB } from './rank.js';
import { createJobs } from './jobs.js';
import { createPhone } from './phone.js';
import { createCollectibles } from './collectibles.js';
import { createJumps } from './jumps.js';
import { listSaves, readSave, writeSave, clearSaves, latestSave } from './save.js';
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
// Step 11: ?story=0 turns the cutscenes off (the test harness plays with
// the story off, so a first-load intro never freezes its gameplay).
const storyOff = params.get('story') === '0';

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
// Step 13: the districts keep score of how the city feels about Raka.
// Hitting a pedestrian sours the district he stands in (the traffic and
// combat rigs report the crime's spot through the same callback).
const districts = createDistricts();
const traffic = createTraffic(scene, world, police, (x, z) => districts.noteCrimeAt(x, z));
const env = createEnvironment(scene, world); // step 8: day-night, weather, lights
const water = createWater(scene, world); // step 9: beach, sea, boats, swim

const chase = createChaseCamera(camera);
const hud = createHud();
const radar = createRadar();
const missions = createMissions(scene);
const rank = createRank(); // step 13: RANK 1 starts at 0 / 300 RP
const jobs = createJobs(scene); // step 13: seven paid side jobs
// Step 14: the Sun Idols — 30 gold idols across the seven districts.
// A pickup pays $25, warms up its home district by 2, chimes and
// autosaves; every ten unlocks a visible reward (gold car paint at 10,
// a gold jacket at 20, a gold phone and $1,000 at 30). A restore
// re-applies the look without paying the cash twice.
const collectibles = createCollectibles(scene, {
  onPickup: (info) => {
    missions.earn(info.cash);
    districts.rewardJob(info.districtId, info.standing);
    hud.setCash(missions.cash);
    sound.chime();
    writeSave('auto', collectSaveData());
  },
  onReward: (tier, meta) => {
    if (tier === 10) {
      // The Sunset GT goes gold: every sunset-orange panel repaints.
      car.group.traverse((o) => {
        if (o.material && o.material.color && o.material.color.getHex() === 0xe8641e) {
          o.material.color.setHex(0xf2c94c);
        }
      });
      if (!meta.restored) hud.showMissionBanner('SUN IDOL REWARD — 10 / 30: the Sunset GT is GOLD now!');
    } else if (tier === 20) {
      // Raka's teal jacket goes gold: the Sun Idol outfit.
      hero.group.traverse((o) => {
        if (o.material && o.material.color && o.material.color.getHex() === 0x3a8ab0) {
          o.material.color.setHex(0xd4af37);
        }
      });
      if (!meta.restored) {
        missions.earn(500);
        hud.setCash(missions.cash);
        hud.showMissionBanner('SUN IDOL REWARD — 20 / 30: gold jacket + $500!');
      }
    } else if (tier === 30) {
      // The phone goes gold: a Sun Idol wallpaper for the SOLMAR TEL.
      const phoneEl = document.getElementById('phone');
      if (phoneEl) {
        phoneEl.style.border = '2px solid #f2c94c';
        phoneEl.style.background = 'linear-gradient(160deg, rgba(80, 58, 10, 0.97), rgba(16, 11, 7, 0.97))';
      }
      if (!meta.restored) {
        missions.earn(1000);
        hud.setCash(missions.cash);
        hud.showMissionBanner('SUN IDOL REWARD — 30 / 30: ALL IDOLS! Gold phone + $1,000!');
      }
    }
    if (!meta.restored) {
      sound.chime();
      writeSave('auto', collectSaveData());
    }
  },
});
// Step 14: the stunt jumps — ten ramps around the map. A clean landing
// pays cash scaled by air time and flips, chained landings multiply it;
// a rough landing pays half the score and no cash, a wall clip crashes.
const jumps = createJumps(scene, {
  onEvent: (ev) => {
    if (ev.type === 'clean') {
      missions.earn(ev.cash);
      phone.recordLedger(`Stunt jump: ${ev.name}`, ev.cash);
      hud.setCash(missions.cash);
      const chainText = ev.chain > 1 ? ` · CHAIN x${ev.chain}` : '';
      hud.showMissionBanner(
        `CLEAN LANDING — ${ev.name} +$${ev.cash} · ${ev.airTime.toFixed(1)}s air`
        + (ev.flips ? ` · ${ev.flips} flip${ev.flips > 1 ? 's' : ''}` : '')
        + chainText,
      );
      sound.chime();
      writeSave('auto', collectSaveData());
    } else if (ev.type === 'rough') {
      hud.showMissionBanner(`ROUGH LANDING — ${ev.name} · ${ev.score} pts, no cash`);
    } else if (ev.type === 'crash') {
      hud.showMissionBanner(`CRASHED — ${ev.name} · clipped a wall mid-air`);
    }
  },
});
const vitals = createVitals();
const combat = createCombat(scene, hero, police, traffic, () => hud.showHit(), (x, z) => traffic.noteShot(x, z), (x, z) => districts.noteCrimeAt(x, z), (name) => hud.showMissionBanner(`PICKED UP — ${name}!`), () => jobs.completedCount);
const movement = createMovement(); // step 10: jump, vault, climb
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));
const story = createStory(hud, input); // step 11: cutscene dialogue
const sound = createSound(); // step 12: a tiny WebAudio synth for shots and menus
// Step 13: the phone — jobs, map, bank, texts. It reads the world through
// the callbacks below and hands job choices back the same way.
const phone = createPhone({
  getMapState: () => radarState(),
  getJobs: () => jobs.list,
  onAcceptJob: (id) => jobs.accept(id),
  onAbandonJob: () => jobs.abandon(),
  getCash: () => missions.cash,
  getRank: () => ({ rank: rank.rank, rp: rank.rp, next: rank.nextThreshold }),
  sound,
});
let introStarted = false; // step 11: the homecoming scene plays once, on load
let cutsceneHint = false; // step 11: the dialogue hint line is showing
let playSeconds = 0; // step 12: seconds played (the STATS tab shows it)

// --- settings (step 12) ------------------------------------------------------
// Sound on/off and graphics quality, kept in localStorage so a choice
// survives a reload. A broken or foreign value falls back to the defaults.
const SETTINGS_KEY = 'solmar-heat-settings';
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      sound: parsed?.sound !== false,
      quality: parsed?.quality === 'low' ? 'low' : 'high',
    };
  } catch {
    return { sound: true, quality: 'high' };
  }
}
const settings = loadSettings();
function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage that refuses a write keeps the old settings; the game plays on.
  }
}
/** Put the settings into effect: pixel ratio and shadows, rain and stars. */
function applySettings() {
  renderer.setPixelRatio(settings.quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = settings.quality !== 'low';
  // Toggling shadows needs the materials to recompile, or nothing changes.
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  env.setQuality(settings.quality);
  sound.setMuted(!settings.sound);
}

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
// Step 10: diving — Space while swimming takes him under for a few
// seconds (a blue tint covers the screen), then he surfaces on his own.
// Diving never drowns him by itself: he surfaces while he still has
// stamina, and the drown rule stays what it was (stamina gone, far out).
let diving = false; // true while Raka is under the surface
let diveTimer = 0; // seconds into the current dive
let wasSwimming = false; // true last frame, so leaving the water can reset the vertical rig
const DIVE_TIME = 4; // seconds a dive lasts before he surfaces on his own
const DIVE_Y = -2.1; // how deep his feet sit while diving (well under the swell)
const DIVE_STAMINA_FLOOR = 20; // stamina left when a dive ends itself early

// --- busted state -----------------------------------------------------------
// A patrol car pinned Raka: controls freeze, the BUSTED screen goes up, and
// after a beat he is hauled back to the start with the heat cleared.
let busted = false;
let bustedTimer = 0;
let lastVehicleHits = 0; // the vehicle.hits count the last crime check saw

function startBusted() {
  busted = true;
  bustedTimer = 0;
  // Step 13: getting caught costs a fine — $50 or 10% of the cash,
  // whichever is smaller — and Mira posts the bail. The ledger records
  // it, the BUSTED screen names it, and the autosave keeps it.
  const fine = missions.deduct(Math.min(50, Math.floor(missions.cash * 0.1)));
  if (fine > 0) {
    phone.recordLedger('KPD fine — BUSTED', -fine);
    hud.showBusted(true, `Busted — bail posted by Mira. Fine: $${fine}.`);
    hud.setCash(missions.cash);
    writeSave('auto', collectSaveData());
  } else {
    hud.showBusted(true);
  }
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
  diving = false;
  diveTimer = 0;
  wasSwimming = false;
  movement.reset();
  hud.showDive(false);
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
  // Step 13: a bust or a waste ends the run's in-progress work — the
  // side job drops with the story chain (the cash stays banked).
  jobs.reset();
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

/**
 * Step 10: the low obstacle a point ahead of Raka stands on, if any — a
 * crate or a seawall close enough to vault or climb. `ahead` is how far
 * in front of him to look (his facing), `margin` grows the footprint, so
 * a vault can start a step early and a climb can start right against it.
 */
function vaultableAhead(ahead, margin) {
  const fx = Math.sin(hero.yaw);
  const fz = Math.cos(hero.yaw);
  const px = hero.group.position.x + fx * ahead;
  const pz = hero.group.position.z + fz * ahead;
  for (const v of world.vaultables) {
    if (
      px >= v.x - v.hw - margin && px <= v.x + v.hw + margin
      && pz >= v.z - v.hd - margin && pz <= v.z + v.hd + margin
    ) return v;
  }
  return null;
}

function enterVehicle(ride) {
  driving = true;
  vehicle = ride;
  vehicleName = ride.name ?? 'Sunset GT';
  lastVehicleHits = ride.hits;
  // A dive ends at the helm: he is out of the water now.
  if (diving) {
    diving = false;
    diveTimer = 0;
    hud.showDive(false);
  }
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
    jobTarget: jobs.target,
    districts: districts.list(),
    time: performance.now() / 1000,
  };
}

// --- save and load (step 12) -------------------------------------------------
/**
 * Gather the game's state into a save object: cash, mission progress,
 * the story beats seen, where Raka stands, the clock and the weather,
 * his health and stamina, the heat, his weapon, and the play time.
 * The rides are not saved: on a load the Sunset GT waits in its parking
 * spot and Raka steps out on foot where he saved.
 */
function collectSaveData() {
  return {
    version: 1,
    savedAt: Date.now(),
    cash: missions.cash,
    completedCount: missions.completedCount,
    storyLog: story.log,
    hero: { x: hero.group.position.x, z: hero.group.position.z, yaw: hero.yaw },
    time: env.hours,
    timeText: env.clockText,
    weather: env.weather,
    health: vitals.health,
    stamina: vitals.stamina,
    wanted: police.wanted,
    weaponSlot: combat.slot,
    // Step 14: the guns Raka owns and their ammo come back with the rest.
    weapons: combat.saveState(),
    playSeconds,
    // Step 13: rank, district standings, side jobs and the bank ledger.
    rankRp: rank.rp,
    standings: districts.snapshot(),
    jobsCompleted: jobs.completedCount,
    activeJob: jobs.active ? { id: jobs.active.id, stage: jobs.stageIndex } : null,
    ledger: phone.ledger,
    // Step 14: the Sun Idols found and the stunt-jump best scores.
    idols: collectibles.snapshot(),
    jumps: jumps.snapshot(),
  };
}

/**
 * Put a save back into the game. Raka steps out on foot where he saved,
 * with a fresh loadout of ammo; the story log picks up where it left
 * off, and the homecoming scene does not replay — it was already lived.
 */
function applySave(data) {
  if (driving) exitVehicle();
  missions.restore(data.cash ?? 0, data.completedCount ?? 0);
  story.restoreLog(data.storyLog ?? []);
  // Step 13: the rank, the district standings, the side job in progress
  // and the bank ledger come back with the rest of the game.
  rank.restore(data.rankRp ?? 0);
  districts.restore(data.standings ?? null);
  jobs.restore(data.activeJob ?? null, data.jobsCompleted ?? 0);
  phone.restoreLedger(data.ledger ?? []);
  // Step 14: the idols found and the jump bests come back too — a
  // restored reward re-applies its look, never its cash.
  collectibles.restore(data.idols ?? null);
  jumps.restore(data.jumps ?? null);
  const hx = data.hero?.x ?? 0;
  const hz = data.hero?.z ?? 10;
  const hyaw = data.hero?.yaw ?? Math.PI;
  hero.group.position.set(hx, 0, hz);
  hero.group.visible = true;
  hero.face(hyaw);
  hero.group.rotation.y = hyaw;
  movement.snapTo(world.groundHeightAt(hx, hz));
  speed = 0;
  if (typeof data.time === 'number') env.setTime(data.time);
  if (typeof data.weather === 'string') env.setWeather(data.weather);
  vitals.setHealth(data.health ?? 100);
  vitals.setStamina(data.stamina ?? 100);
  police.setWanted(Math.max(0, Math.min(5, data.wanted ?? 0)));
  // Step 14: a save that knows its guns restores them; an old save keeps
  // the pistol-or-fists slot it recorded.
  if (data.weapons) combat.restoreState(data.weapons);
  else combat.selectSlot(data.weaponSlot === 1 ? 1 : 2);
  playSeconds = data.playSeconds ?? 0;
  introStarted = true;
  hud.setCash(missions.cash);
  hud.setMission(
    missions.active ? missions.active.name : null,
    missions.active ? missions.active.objective : null,
  );
  hud.setWanted(police.wanted);
  hud.setHealth(vitals.health, vitals.maxHealth);
  hud.setStamina(vitals.stamina, vitals.maxStamina);
}

// --- the pause menu (step 12) -------------------------------------------------
// The menu reads the world through callbacks and hands choices back the
// same way; the game loop owns when it opens and closes.
const pause = createPause({
  getMapState: () => radarState(),
  getStats: () => ({
    cash: missions.cash,
    completed: missions.completedCount,
    total: 4,
    activeName: missions.active ? missions.active.name : null,
    wanted: police.wanted,
    health: vitals.health,
    stamina: vitals.stamina,
    beats: story.log.length,
    playSeconds,
    clockText: env.clockText,
    phase: env.phase,
    weather: env.weather,
    // Step 13: rank, RP, side jobs and the district standings.
    rank: rank.rank,
    rp: rank.rp,
    rpNext: rank.nextThreshold,
    jobsCompleted: jobs.completedCount,
    activeJobName: jobs.active ? jobs.active.name : null,
    standings: districts.list(),
  }),
  getStoryLog: () => story.log,
  settings,
  onSettingChange: (key, value) => {
    settings[key] = value;
    persistSettings();
    applySettings();
  },
  listSaves: () => listSaves(),
  onSave: (slot) => {
    const data = collectSaveData();
    writeSave(slot, data);
    return data;
  },
  onLoad: (slot) => {
    const data = readSave(slot);
    if (!data) return false;
    applySave(data);
    return true;
  },
  onReset: () => {
    clearSaves();
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // Storage that refuses the removal keeps the old settings; the reload still restarts.
    }
    window.location.reload();
  },
  sound,
});
applySettings();

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
  } else if (shotName === 'shoot' || shotName === 'smg' || shotName === 'shotgun' || shotName === 'ar') {
    // Step 14: the weapon shots stage the named gun — the SMG, the
    // shotgun or the rifle — aiming at the dummy with one pull already
    // down the range, the survival panel showing the gun and its ammo.
    if (shotName !== 'shoot') combat.give(shotName);
    combat.stageShoot(); // tracer held on the frame, magazine one pull down
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

// --- the start overlay (step 12) ---------------------------------------------
// When a save exists, the player picks CONTINUE (the newest save) or NEW
// GAME before the world runs. Staged screenshot frames and the test
// harness (?story=0) never see it: they always start fresh.
const startOverlayEl = document.getElementById('start-overlay');
const startInfoEl = document.getElementById('start-save-info');
let startPending = false;
const newestSave = !storyOff && !frozen ? latestSave() : null;
if (newestSave) {
  startPending = true;
  const d = newestSave.data;
  startInfoEl.innerHTML = `Last save — <b>$${(d.cash ?? 0).toLocaleString('en-US')}</b> · ${d.completedCount ?? 0} / 4 missions · ${d.timeText ?? ''} ${d.weather ?? ''}`;
  startOverlayEl.style.display = 'flex';
}
document.getElementById('start-continue').addEventListener('click', () => {
  sound.click();
  if (newestSave) {
    applySave(newestSave.data);
    startOverlayEl.style.display = 'none';
    startPending = false;
  }
});
document.getElementById('start-new').addEventListener('click', () => {
  sound.click();
  startOverlayEl.style.display = 'none';
  startPending = false;
});

// --- movement ----------------------------------------------------------------
function step(dt) {
  // Step 12: the start overlay waits for a choice before the world runs.
  if (startPending) return;
  // Step 13: the phone — T opens it, Esc or T closes it. While it is
  // open the world freezes like the pause menu, but it is a separate
  // screen: Esc over the phone closes the phone, never the pause menu.
  // Presses made over the phone are drained, so a Space or a click over
  // it never fires a jump or a shot the moment play resumes.
  if (phone.open) {
    if (input.takeSkip() || input.takePhone()) phone.closeMenu();
    input.drain();
    return;
  }
  // Step 12: pause — Esc/P toggles, but never during a cutscene (there
  // Esc skips the dialogue instead). While paused the world is frozen:
  // no clock, no weather, no traffic, no missions. Presses made over the
  // menu are drained, so a Space or a click over the menu never fires a
  // jump or a shot the moment play resumes.
  if (!story.playing && (input.takePause() || input.takeSkip())) {
    pause.toggle();
  }
  if (pause.open) {
    input.drain();
    return;
  }
  // Step 13: T opens the phone (never during a cutscene, like the pause
  // menu). The jump-the-clock key is gone: the clock only moves through
  // the debug API now (__solmar.debug.setTime(h)).
  if (!story.playing && input.takePhone()) phone.toggle();
  if (phone.open) {
    input.drain();
    return;
  }

  world.update(dt);
  // Step 8: C turns the weather (clear → rain → fog → storm). It works
  // on foot and behind the wheel. It runs before the sky update, so the
  // HUD clock reads the jumped time at once.
  if (input.takeWeather()) env.cycleWeather();
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
    jobs.pulse(dt);
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

  // Step 11: the story log opens with L, on foot, driving, or mid-cutscene.
  if (input.takeLog()) story.toggleLog();

  // Step 11: the homecoming scene plays once, on the first frame of play
  // (never on a staged screenshot frame, never with the story off).
  if (!introStarted) {
    introStarted = true;
    if (!storyOff) story.play('intro');
  }

  // Step 11: a cutscene pauses the world — the dialogue plays, the game
  // waits. The sky and the sea hold still behind the letterbox bars, the
  // radar keeps drawing, and the mission marker keeps pulsing. Space or a
  // click moves the dialogue on, Esc skips the scene.
  if (story.playing) {
    // A P pressed mid-scene is dropped: it must not open the pause menu
    // the moment the scene ends.
    input.takePause();
    if (!cutsceneHint) {
      cutsceneHint = true;
      hud.setHint('<b>Space</b> / <b>click</b> continue dialogue &nbsp;·&nbsp; <b>Esc</b> skip scene');
    }
    story.update(dt);
    env.update(dt, {
      player: { x: hero.group.position.x, z: hero.group.position.z },
      driven: null,
      frozen: true,
    });
    water.update(dt, { driven: null, frozen: true });
    chase.update(dt, hero.group.position, false);
    radar.update(radarState());
    missions.pulse(dt);
    if (!story.playing) {
      cutsceneHint = false;
      hud.setHint(null);
    }
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

    // Step 10: Space — in the water it dives (or surfaces), on land it
    // jumps, vaults a low obstacle he is running at, or climbs onto one
    // he is standing against. A dive ends on its own after a few seconds
    // or when his stamina runs low, so diving alone can never drown him.
    if (input.takeJump()) {
      if (swimming) {
        if (diving) {
          diving = false;
          diveTimer = 0;
          hud.showDive(false);
        } else if (vitals.stamina > DIVE_STAMINA_FLOOR) {
          diving = true;
          diveTimer = 0;
          hud.showDive(true);
        }
      } else {
        const vaultTarget = vaultableAhead(1.8, 0.5);
        // A climb only counts while he is still below the top: standing
        // on a crate and pressing Space is a jump, not another climb.
        const climbTarget = (vaultTarget ?? vaultableAhead(0.9, 0.2));
        const climbTop = climbTarget ? climbTarget.h : 0;
        if (vaultTarget && running && moving) {
          movement.vault();
        } else if (climbTarget && world.groundHeightAt(hero.group.position.x, hero.group.position.z) < climbTop - 0.05) {
          // Step up onto the top: step toward its centre first, stopping
          // a little short of it, so he ends up standing on the top
          // instead of on its edge (or just past it, and falling off).
          const dx = climbTarget.x - hero.group.position.x;
          const dz = climbTarget.z - hero.group.position.z;
          const d = Math.hypot(dx, dz) || 1;
          const nudge = Math.min(Math.max(d - 0.3, 0), 1.2);
          hero.group.position.x += (dx / d) * nudge;
          hero.group.position.z += (dz / d) * nudge;
          movement.climb(climbTarget.h);
        } else {
          movement.jump();
        }
      }
    }
    if (diving) {
      diveTimer += dt;
      if (diveTimer >= DIVE_TIME || vitals.stamina <= DIVE_STAMINA_FLOOR) {
        diving = false;
        diveTimer = 0;
        hud.showDive(false);
      }
    }
    if (!swimming && diving) {
      // He swam back into the shallows while under: surface at once.
      diving = false;
      diveTimer = 0;
      hud.showDive(false);
    }

    // Diving spends stamina like running does; the drown rule itself is
    // unchanged (stamina gone, far out, five seconds of grace).
    vitals.update(dt, (running && moving) || (fastSwim && moving) || exhaustedSwim || diving);

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

    // Ease toward the target speed (walk, run, wade, swim, or stop). A
    // vault adds a burst, so he carries over the obstacle instead of
    // landing on top of it.
    const target = !moving ? 0
      : swimming ? (fastSwim ? FAST_SWIM_SPEED : SWIM_SPEED)
      : wading ? (running ? RUN_SPEED * 0.5 : WALK_SPEED * 0.5)
      : (running ? RUN_SPEED : WALK_SPEED);
    const boosted = movement.vaulting ? target * 1.35 : target;
    speed += (boosted - speed) * Math.min(1, dt * 8);
    if (speed < 0.05) speed = 0;

    if (moving && speed > 0.05) {
      hero.group.position.x += moveX * speed * dt;
      hero.group.position.z += moveZ * speed * dt;
      // Stay inside the city — and the bay, south to the far edge of the sea.
      hero.group.position.x = Math.max(-world.bounds, Math.min(world.bounds, hero.group.position.x));
      hero.group.position.z = Math.max(-world.bounds, Math.min(water.seaMaxZ, hero.group.position.z));
      // Step 10: crates and low walls are solid on foot — a walk into one
      // stops at its edge. (Airborne, vaulting and climbing skip this, so
      // a jump or a vault can carry him over or onto one.)
      const feetY = movement.y;
      if (!swimming && !movement.airborne && !movement.climbing) {
        let top = 0;
        for (const v of world.vaultables) {
          if (
            hero.group.position.x >= v.x - v.hw && hero.group.position.x <= v.x + v.hw
            && hero.group.position.z >= v.z - v.hd && hero.group.position.z <= v.z + v.hd
          ) top = Math.max(top, v.h);
        }
        if (feetY < top - 0.05) {
          const out = world.pushOutOfVaultable(hero.group.position.x, hero.group.position.z, 0.5);
          hero.group.position.x = out.x;
          hero.group.position.z = out.z;
        }
      }
      // Face where he moves.
      hero.face(Math.atan2(moveX, moveZ));
    }

    // The ground under his feet: the street, or an obstacle's top.
    const groundY = world.groundHeightAt(hero.group.position.x, hero.group.position.z);
    if (swimming) {
      // A jump that carries him into the sea ends at the water: the
      // vertical rig's flags clear, and the swim takes his height over.
      if (movement.airborne || movement.vaulting || movement.climbing) movement.reset();
      if (diving) {
        // Under the surface: feet well below the swell, the crawl stroke
        // still going, the whole screen blue.
        hero.group.position.y = DIVE_Y;
        hero.swim(dt, fastSwim);
      } else {
        // Head above the water, bobbing on the swell; the crawl replaces the walk.
        hero.group.position.y = -0.75 + Math.sin(performance.now() / 1000 * 2) * 0.05;
        hero.swim(dt, fastSwim);
      }
      hud.updateSwim(speed, fastSwim);
    } else {
      // Back on dry land after a swim: feet on the ground under him.
      if (wasSwimming) movement.snapTo(groundY);
      hero.group.position.y = movement.update(dt, groundY);
      hero.update(dt, speed, moving, movement.airborne, movement.vaulting, groundY);
      hud.updateFoot(speed, moving, running);
    }
    wasSwimming = swimming;
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

    // --- weapons: 1 is the fists, 2 is the pistol, 3 the SMG, 4 the
    // shotgun, 5 the assault rifle; the wheel cycles the ones he owns.
    // A click uses whichever is selected: a punch up close, a pull at
    // range. The SMG and the rifle are full-auto: they keep firing while
    // the trigger stays down. R reloads the selected gun (the fists never
    // reload). Letting go of the trigger bleeds the spread back off.
    if (input.takeSlot1()) combat.selectSlot(1);
    if (input.takeSlot2()) combat.selectSlot(2);
    if (input.takeSlot3()) combat.selectSlot(3);
    if (input.takeSlot4()) combat.selectSlot(4);
    if (input.takeSlot5()) combat.selectSlot(5);
    const wheelSteps = input.takeWheel();
    if (wheelSteps !== 0) combat.cycleSlot(wheelSteps > 0 ? 1 : -1);
    if (!swimming && input.takeShot()) {
      if (combat.slot === 1) {
        combat.punch();
        sound.punch();
      } else if (combat.shoot(aiming)) {
        sound.shot();
      }
    } else if (!swimming && combat.auto && input.mouseHeld) {
      if (combat.shoot(aiming)) sound.shot();
    }
    if (!input.mouseHeld) combat.releaseTrigger();
    if (!swimming && input.takeReload()) combat.reload();

    // --- a ride: near one, E gets in -----------------------------------------
    // Space does different things near a low obstacle, so the prompt
    // names the move it will do: a vault beats a climb, a climb beats
    // getting in a ride. A climb only counts while he is still below the
    // top — standing on a crate already, the prompt stays quiet.
    const ride = nearestRide();
    const vaultNear = !swimming && vaultableAhead(1.8, 0.5);
    const climbNear = !swimming && !vaultNear && vaultableAhead(0.9, 0.2);
    const climbShown = climbNear
      && world.groundHeightAt(hero.group.position.x, hero.group.position.z) < climbNear.h - 0.05;
    hud.setPrompt(
      vaultNear && running && moving ? 'Press Space to vault'
        : climbShown ? 'Press Space to climb up'
        : ride ? (ride.prompt ?? 'Press E to enter the Sunset GT')
        : null,
    );
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
  // Step 11: what the chain looked like before this frame, so a job
  // starting or paying out can get its story beat.
  const wasActiveId = missions.active ? missions.active.id : null;
  const wasActiveName = missions.active ? missions.active.name : null;
  const wasCash = missions.cash;
  missions.update(dt, {
    x: player.x,
    z: player.z,
    driving,
    vehicle: driving ? vehicle : null,
    wanted: police.wanted,
    dummyHits: combat.dummyHits,
    vehicles: traffic.vehicles,
  });
  // Step 11: a job that just paid out gets its last word, and a job that
  // just started gets its intro — in that order, queued behind each
  // other. The last job pays out into the all-jobs-done line as well.
  if (!storyOff && missions.cash > wasCash && wasActiveId) {
    story.play(`done-${wasActiveId}`);
    if (wasActiveId === 'heat') story.play('done-all');
  }
  // Step 12: a payout autosaves, so a crash never eats a finished job.
  // It runs even with the story switched off — a payout is a payout.
  // Step 13: a mission payout also banks 100 RP and writes the bank
  // ledger, story on or off. A rank-up rides on the same banner.
  let rankUp = null;
  if (missions.cash > wasCash && wasActiveId) {
    rankUp = rank.addRp(RP_PER_MISSION);
    phone.recordLedger(`Mission: ${wasActiveName ?? wasActiveId}`, missions.cash - wasCash);
    writeSave('auto', collectSaveData());
  }
  const banner = missions.takeBanner();
  if (banner) {
    const text = rankUp && rankUp.up ? `${banner} · RANK UP — RANK ${rankUp.rank}!` : banner;
    hud.showMissionBanner(text);
    sound.chime();
  } else if (rankUp && rankUp.up) {
    hud.showMissionBanner(`RANK UP — RANK ${rankUp.rank}!`);
    sound.chime();
  }
  const nowActiveId = missions.active ? missions.active.id : null;
  if (!storyOff && nowActiveId && nowActiveId !== wasActiveId) {
    story.play(`intro-${nowActiveId}`);
  }
  hud.setMission(
    missions.active ? missions.active.name : null,
    missions.active ? missions.active.objective : null,
  );
  hud.setCash(missions.cash);

  // --- step 13: the side jobs — one at a time, beside the story missions --
  // A finished job pays cash, warms up its home district, banks 50 RP
  // and writes the bank ledger; a payout autosaves like a mission's.
  jobs.update(dt, {
    x: player.x,
    z: player.z,
    driving,
    vehicle: driving ? vehicle : null,
    wanted: police.wanted,
    dummyHits: combat.dummyHits,
    vehicles: traffic.vehicles,
  });
  const jobPayout = jobs.takePayout();
  if (jobPayout) {
    missions.earn(jobPayout.reward);
    const jobRankUp = rank.addRp(RP_PER_JOB);
    districts.rewardJob(jobPayout.district, 8);
    phone.recordLedger(`Job: ${jobPayout.name}`, jobPayout.reward);
    const text = jobRankUp.up
      ? `JOB COMPLETE — ${jobPayout.name} +$${jobPayout.reward} · RANK UP — RANK ${jobRankUp.rank}!`
      : `JOB COMPLETE — ${jobPayout.name} +$${jobPayout.reward} · ${jobPayout.districtName} +8`;
    hud.showMissionBanner(text);
    sound.chime();
    writeSave('auto', collectSaveData());
    hud.setCash(missions.cash);
  }

  // --- step 14: the Sun Idols and the stunt jumps --------------------------
  // An idol is picked up by the chest: on foot that is a metre above
  // his feet (so a jump reaches a high one), behind the wheel a metre
  // above the ride. The jumps run off the ride Raka drives — on foot
  // they only tick their cooldowns and fade the landing dust.
  collectibles.update(dt, {
    x: player.x,
    z: player.z,
    chestY: (driving ? vehicle.group.position.y : hero.group.position.y) + 1.0,
  });
  jumps.update(dt, { driving, vehicle: driving ? vehicle : null, chase });

  // --- step 13: the standing readouts — district, rank, side job ----------
  // The HUD refreshes these every frame (its setters cache, so a steady
  // value costs nothing); the district follows Raka as he crosses the map.
  const here = districts.at(player.x, player.z);
  hud.setDistrict(`${here.name} · ${districts.label(here.id)} ${districts.standing(here.id)}`);
  hud.setIdols(collectibles.count, collectibles.total, jumps.bestScore);
  const prog = rank.progress;
  hud.setRank(rank.rank, rank.rp, rank.nextThreshold, prog.earned, prog.needed);
  hud.setJob(jobs.active ? jobs.active.name : null, jobs.active ? jobs.objective : null);

  // --- the radar: Raka, the heat, the street and the mission target --------
  radar.update(radarState());
  // Step 14: the nearby Sun Idols draw as gold diamonds on the radar,
  // after the radar itself (it clears the canvas every frame).
  collectibles.drawRadarBlips(player.x, player.z);
  // Step 12: the play clock only runs while the world does — never while
  // paused, never on a frozen frame, never mid-cutscene.
  playSeconds += dt;
}

// --- the loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  // Step 14: a clean landing runs a brief slow-motion pulse (0.45x for
  // 0.7 s) — the world hangs in the air with the jump, then snaps back.
  const dt = Math.min(clock.getDelta(), 0.05) * (jumps.slowmoActive() ? 0.45 : 1);
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
  /** Step 14: the selected gun's id, the guns owned, and the pickups. */
  get weaponId() { return combat.weaponId; },
  get ownedWeapons() { return combat.owned; },
  get weaponPickups() { return combat.pickups; },
  get damageDealt() { return combat.damageDealt; },
  get lastDamage() { return combat.lastDamage; },
  get lastPelletsHit() { return combat.lastPelletsHit; },
  get bloom() { return combat.bloom; },
  get activeTracers() { return combat.activeTracers; },
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
  /** Step 10: true while Raka is under the surface on a dive. */
  get diving() { return diving; },
  /** Step 10: true while Raka is off the ground (a jump, a vault, a fall). */
  get airborne() { return movement.airborne; },
  /** Step 10: true while a vault's burst is running. */
  get vaulting() { return movement.vaulting; },
  /** Step 10: the selected weapon slot (1 Fists, 2 Pistol). */
  get weaponSlot() { return combat.slot; },
  /** Step 10: punches swung and punches that landed. */
  get punchesThrown() { return combat.punchesThrown; },
  get punchHits() { return combat.punchHits; },
  /** Step 10: the ground height under Raka (a crate's top, or 0). */
  get groundY() { return world.groundHeightAt(hero.group.position.x, hero.group.position.z); },
  /** Step 10: the low obstacles Raka can vault or climb. */
  get vaultables() {
    return world.vaultables.map((v) => ({ x: v.x, z: v.z, hw: v.hw, hd: v.hd, h: v.h }));
  },
  /** Step 10: true while the underwater tint is showing. */
  get diveOverlayShown() {
    const el = document.getElementById('dive-overlay');
    return el ? el.style.display === 'block' : false;
  },
  /** Step 11: true while a cutscene is playing. */
  get storyPlaying() { return story.playing; },
  /** Step 11: the story beats seen so far. */
  get storyLog() { return story.log; },
  /** Step 12: true while the pause menu is open (the world is frozen). */
  get paused() { return pause.open; },
  /** Step 12: the pause tab showing now. */
  get pauseTab() { return pause.tab; },
  /** Step 12: the sound setting (true = sound on) and the graphics quality. */
  get soundOn() { return settings.sound; },
  get soundMuted() { return sound.muted; },
  get quality() { return settings.quality; },
  /** Step 12: seconds played in this session (and in loaded saves). */
  get playSeconds() { return playSeconds; },
  /** Step 12: true while the start overlay waits for CONTINUE or NEW GAME. */
  get startPending() { return startPending; },
  /** Step 13: true while the phone is open (the world is frozen). */
  get phoneOpen() { return phone.open; },
  /** Step 13: the phone tab showing now. */
  get phoneTab() { return phone.tab; },
  /** Step 13: the district Raka stands in, with its standing and label. */
  get district() {
    const d = districts.at(hero.group.position.x, hero.group.position.z);
    return { name: d.name, standing: districts.standing(d.id), label: districts.label(d.id) };
  },
  /** Step 13: every district with its standing and label. */
  get districts() { return districts.list(); },
  /** Step 13: the rank, the RP banked, and the next rank's threshold. */
  get rank() { return { rank: rank.rank, rp: rank.rp, next: rank.nextThreshold }; },
  /** Step 13: the side job in progress (or null) and the jobs finished. */
  get job() {
    return {
      active: jobs.active ? jobs.active.id : null,
      objective: jobs.objective,
      completed: jobs.completedCount,
      target: jobs.target,
    };
  },
  /** Step 13: the bank ledger's entries, oldest first. */
  get ledger() { return phone.ledger; },
  /** Step 14: the Sun Idols found so far, and the rewards unlocked. */
  get idols() {
    return {
      count: collectibles.count,
      total: collectibles.total,
      list: collectibles.list,
      rewards: collectibles.unlockedRewards,
    };
  },
  /** Step 14: the stunt jumps — the flight, the bests, the chain, the ramps. */
  get jumps() {
    return {
      flying: jumps.flying,
      flight: jumps.flightInfo,
      best: jumps.bestScore,
      chain: jumps.chain,
      ramps: jumps.list,
    };
  },
  /** Step 14: the ride's height off the ground (0 on the street, up in the air off a ramp). */
  get vehicleY() { return driving ? vehicle.group.position.y : 0; },
  /** Step 14: the ride's pitch and roll while it flies (0 on the street). */
  get vehicleTilt() {
    if (!driving) return { pitch: 0, roll: 0 };
    return { pitch: vehicle.group.rotation.x, roll: vehicle.group.rotation.z };
  },
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
    /** Step 10: select a weapon slot at once (1 Fists, 2 Pistol, 3 SMG, 4 Shotgun, 5 AR). */
    selectSlot(n) { return combat.selectSlot(n); },
    /** Step 14: give Raka a gun at once, as if he took its pickup. */
    giveWeapon(id) { return combat.give(id); },
    /** Step 14: the guns' state (the test harness reads it). */
    weaponState() {
      return {
        slot: combat.slot,
        weaponId: combat.weaponId,
        name: combat.weaponName,
        type: combat.weaponType,
        mag: combat.mag,
        reserve: combat.reserve,
        reloading: combat.reloading,
        auto: combat.auto,
        owned: combat.owned,
        pickups: combat.pickups,
        defs: combat.defs,
        shotsFired: combat.shotsFired,
        hits: combat.hits,
        dummyHits: combat.dummyHits,
        damageDealt: combat.damageDealt,
        lastDamage: combat.lastDamage,
        lastPelletsHit: combat.lastPelletsHit,
        bloom: combat.bloom,
        activeTracers: combat.activeTracers,
        hudWeapon: document.getElementById('weapon-name').textContent,
        hudAmmo: document.getElementById('ammo-num').textContent,
      };
    },
    /** Step 14: put Raka beside the named gun's pickup (on foot). */
    toPickup(id) {
      if (driving) return false;
      const p = combat.pickups.find((pk) => pk.weapon === id);
      if (!p) return false;
      hero.group.position.set(p.x + 1.5, 0, p.z);
      hero.group.visible = true;
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      speed = 0;
      return true;
    },
    /** Step 10: throw a punch at once, as if Raka clicked with the fists. */
    punch() { return combat.punch(); },
    /** Step 10: jump at once, as if Raka pressed Space on land. */
    jump() { return movement.jump(); },
    /** Step 10: vault at once, as if Raka pressed Space while running at an obstacle. */
    vault() { return movement.vault(); },
    /** Step 10: what the Space handler sees right now (vault/climb test aid). */
    vaultCheck() {
      const vaultTarget = vaultableAhead(1.8, 0.5);
      return {
        vaultTarget: vaultTarget ? { x: vaultTarget.x, z: vaultTarget.z, h: vaultTarget.h } : null,
        climbTarget: Boolean(vaultTarget ?? vaultableAhead(0.9, 0.2)),
        running: input.running && vitals.canRun,
        inputRunning: input.running,
        canRun: vitals.canRun,
        moving: input.moving,
        forward: input.forward,
        yaw: hero.yaw,
        pos: { x: hero.group.position.x, z: hero.group.position.z },
        airborne: movement.airborne,
        climbing: movement.climbing,
      };
    },
    /** Step 10: put Raka beside the i-th low obstacle, facing it. */
    toVaultable(i) {
      if (driving) return false;
      const v = world.vaultables[i];
      if (!v) return false;
      hero.group.position.set(v.x, 0, v.z + v.hd + 1.6);
      hero.group.visible = true;
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      movement.snapTo(0);
      speed = 0;
      return true;
    },
    /** Step 10: put Raka on top of the i-th low obstacle. */
    onVaultable(i) {
      if (driving) return false;
      const v = world.vaultables[i];
      if (!v) return false;
      hero.group.position.set(v.x, 0, v.z);
      hero.group.visible = true;
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      movement.snapTo(v.h);
      speed = 0;
      return true;
    },
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
    /** Step 11: the story player's state (for the test harness). */
    storyState() {
      return {
        playing: story.playing,
        scene: story.sceneId,
        line: story.lineIndex,
        typed: story.typed,
        lineDone: story.lineDone,
        log: story.log,
        logOpen: story.logOpen,
        boxShown: document.getElementById('dialogue').style.display,
        beat: document.getElementById('story-beat').textContent,
        hint: document.getElementById('hint').textContent,
      };
    },
    /** Step 11: play a scene by id at once ('intro', 'intro-pier', ...). */
    playScene(id) { return story.play(id); },
    /** Step 11: skip the scene playing now and everything queued. */
    skipStory() { story.skipAll(); },
    /** Step 11: open or close the story log panel. */
    toggleStoryLog() { return story.toggleLog(); },
    /** Step 12: open the pause menu at once (as if Raka pressed Esc). */
    openPause() {
      if (!pause.open) pause.toggle();
      return pause.open;
    },
    /** Step 12: close the pause menu at once. */
    closePause() {
      if (pause.open) pause.toggle();
      return pause.open;
    },
    /** Step 12: switch the pause menu to a tab at once. */
    pauseTab(name) { return pause.openTab(name); },
    /** Step 12: the pause menu's state (for the test harness). */
    pauseState() {
      return {
        open: pause.open,
        tab: pause.tab,
        display: document.getElementById('pause-menu').style.display,
      };
    },
    /** Step 12: save the game into a slot at once (1 | 2 | 3 | 'auto'). */
    saveTo(slot) {
      const data = collectSaveData();
      return writeSave(slot, data) ? data : null;
    },
    /** Step 13: open the phone at once (as if Raka pressed T). */
    openPhone() {
      if (!phone.open) phone.toggle();
      return phone.open;
    },
    /** Step 13: close the phone at once. */
    closePhone() {
      if (phone.open) phone.toggle();
      return phone.open;
    },
    /** Step 13: switch the phone to a tab at once. */
    phoneTab(name) { return phone.openTab(name); },
    /** Step 13: the phone's state (for the test harness). */
    phoneState() {
      return {
        open: phone.open,
        tab: phone.tab,
        display: document.getElementById('phone').style.display,
      };
    },
    /** Step 13: bank RP at once (the test harness checks the rank-up). */
    addRp(n) { return rank.addRp(n); },
    /** Step 13: take a side job at once (as if Raka accepted it on the phone). */
    acceptJob(id) { return jobs.accept(id); },
    /** Step 13: drop the active side job at once. */
    abandonJob() { return jobs.abandon(); },
    /** Step 13: the side job's state (for the test harness). */
    jobState() {
      return {
        active: jobs.active ? jobs.active.id : null,
        objective: jobs.objective,
        completed: jobs.completedCount,
        target: jobs.target,
        stage: jobs.stageIndex,
        list: jobs.list,
      };
    },
    /** Step 13: put Raka beside the active job's target (on foot). */
    toJobTarget() {
      const t = jobs.target;
      if (!t || driving) return false;
      hero.group.position.set(t.x, 0, t.z + 2);
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      speed = 0;
      return true;
    },
    /** Step 13: the district a spot sits in, with standing and label. */
    districtAt(x, z) {
      const d = districts.at(x, z);
      return { name: d.name, standing: districts.standing(d.id), label: districts.label(d.id) };
    },
    /** Step 14: put Raka beside the i-th Sun Idol, on foot (for the tests). */
    toIdol(i) {
      if (driving) return false;
      const idol = collectibles.list[i];
      if (!idol) return false;
      hero.group.position.set(idol.x + 1.5, 0, idol.z);
      hero.group.visible = true;
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      movement.snapTo(0);
      speed = 0;
      return true;
    },
    /** Step 14: pick the i-th Sun Idol up at once (for the tests). */
    collectIdol(i) { return collectibles.collectById(i); },
    /** Step 14: the idols within radar range of a spot (for the tests). */
    idolBlips(x, z) { return collectibles.blipsNear(x, z); },
    /**
     * Step 14: put the ride Raka drives on the approach to the i-th
     * ramp, facing along it, stopped — drive forward to launch.
     */
    toRamp(i) {
      if (!driving) return false;
      const ramp = jumps.list[i];
      if (!ramp) return false;
      const fx = Math.sin(ramp.yaw);
      const fz = Math.cos(ramp.yaw);
      vehicle.group.position.set(ramp.x - fx * 8, 0, ramp.z - fz * 8);
      vehicle.setHeading(ramp.yaw);
      vehicle.halt();
      return true;
    },
    /** Step 14: launch a jump off the i-th ramp at once (for the tests). */
    launchJump(i, speed = 20) {
      if (!driving) return false;
      const ramp = jumps.list[i];
      if (!ramp) return false;
      return jumps.debugLaunch(vehicle, ramp.id, speed);
    },
    /** Step 14: spin the ride in the air (for the flip test). */
    spinInAir(yaw) {
      if (!jumps.flying) return false;
      vehicle.setHeading(yaw);
      return true;
    },
    /** Step 12: load a slot at once. */
    loadFrom(slot) {
      const data = readSave(slot);
      if (!data) return false;
      applySave(data);
      return true;
    },
    /** Step 12: set a setting at once ('sound' true/false, 'quality' 'high'/'low'). */
    setSetting(key, value) {
      settings[key] = value;
      persistSettings();
      applySettings();
      return settings[key];
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
