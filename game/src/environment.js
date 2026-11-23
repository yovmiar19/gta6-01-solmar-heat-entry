// Step 8 — the living sky of Solmar Bay: a day-night cycle, dynamic weather
// and lights that answer the dark. One full day takes ten minutes of play:
// the sun arcs from east to west, the sky runs blue to gold to black, the
// stars come out, and after dark the lamps pool warm light on the avenue,
// the windows glow yellow and the neon signs blaze. The weather turns on
// its own every couple of minutes — clear, rain, fog, storm — and the rain
// makes the roads glossy while a storm throws lightning across the sky.
// C cycles the weather by hand, T jumps the clock two hours ahead.

import { mulberry32 } from './world.js';

const CYCLE_SECONDS = 600; // one full day in ten minutes of play
const WEATHER_HOLD_SECONDS = 150; // a weather lasts ~2.5 minutes, then may turn
const DAY_START = 17.5; // golden hour, so the first frame looks like the old game
const WEATHERS = ['CLEAR', 'RAIN', 'FOG', 'STORM'];
const WEATHER_WEIGHTS = [0.4, 0.25, 0.2, 0.15]; // clear is the most likely turn
const RAIN_COUNT = 1500; // rain drops in the box around the player

// Sky keyframes: [hour, top colour, horizon colour]. The day runs blue to
// gold (the old golden-hour look at 17:30) to black, and back through dawn.
const SKY_KEYS = [
  [0.0, '#0a0e1e', '#141b30'],
  [4.5, '#0a0e1e', '#141b30'],
  [5.5, '#2c4a78', '#ff9a5c'],
  [7.0, '#5f9ac8', '#cfe0ea'],
  [11.0, '#6fa8d8', '#cfe4f2'],
  [16.0, '#6fa8d8', '#dceaf2'],
  [17.5, '#6fa8d8', '#ffcf8a'],
  [18.5, '#4a5a8a', '#ff8a4d'],
  [20.0, '#141a30', '#232c48'],
  [21.0, '#0a0e1e', '#141b30'],
  [24.0, '#0a0e1e', '#141b30'],
];

function phaseFor(h) {
  if (h < 5 || h >= 21) return 'NIGHT';
  if (h < 7) return 'DAWN';
  if (h < 16) return 'DAY';
  if (h < 18.5) return 'GOLDEN HOUR';
  return 'DUSK';
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function lerpColor(a, b, t, out) {
  out.setHex(a);
  out.lerp(new THREE.Color(b), t);
  return out;
}

/** Build the environment rig into `scene`, driven by the city `world`. */
export function createEnvironment(scene, world) {
  const rand = mulberry32(7);
  let hours = DAY_START;
  let weather = 'CLEAR';
  let weatherTimer = WEATHER_HOLD_SECONDS * 0.6; // the first turn comes sooner
  let lightningTimer = 4 + Math.random() * 5;
  let flash = 0; // lightning flash, 1 at the strike, decaying fast
  let skyTimer = 0; // throttle the sky canvas redraws
  let nightFactor = 0; // 0 = full day, 1 = full night
  let rainLevel = 0; // 0 = dry, 1 = a storm's downpour

  // --- the sky: a small canvas gradient, redrawn as the colours turn ------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTexture;

  function skyColorsAt(h, outTop, outHorizon) {
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= h) i += 1;
    const [h0, top0, hor0] = SKY_KEYS[i];
    const [h1, top1, hor1] = SKY_KEYS[i + 1];
    const t = clamp01((h - h0) / Math.max(0.001, h1 - h0));
    lerpColor(top0, top1, t, outTop);
    lerpColor(hor0, hor1, t, outHorizon);
    return { top: outTop, horizon: outHorizon };
  }

  const topColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const greyColor = new THREE.Color(0x8a8f96);
  const paleColor = new THREE.Color(0xb8bcc0);
  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();

  function drawSky() {
    skyColorsAt(hours, topColor, horizonColor);
    // Weather greys the sky: rain and storm drag it toward slate, fog
    // toward pale, and a lightning flash bleaches it for an instant.
    if (weather === 'RAIN') {
      topColor.lerp(greyColor, 0.45); horizonColor.lerp(greyColor, 0.45);
    } else if (weather === 'STORM') {
      topColor.lerp(greyColor, 0.6); horizonColor.lerp(greyColor, 0.6);
    } else if (weather === 'FOG') {
      topColor.lerp(paleColor, 0.5); horizonColor.lerp(paleColor, 0.5);
    }
    if (flash > 0) {
      topColor.lerp(tmpColor.setHex(0xffffff), flash * 0.45);
      horizonColor.lerp(tmpColor.setHex(0xffffff), flash * 0.45);
    }
    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, `#${topColor.getHexString()}`);
    tmpColor.copy(topColor).lerp(horizonColor, 0.55);
    grad.addColorStop(0.55, `#${tmpColor.getHexString()}`);
    grad.addColorStop(1.0, `#${horizonColor.getHexString()}`);
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 4, 512);
    skyTexture.needsUpdate = true;
  }

  // --- the stars: a dome of points, only visible after dark ---------------
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    // A random point on the upper hemisphere, far out past the fog.
    const a = rand() * Math.PI * 2;
    const e = Math.asin(rand() * 0.95 + 0.05); // elevation, above the horizon
    const r = 230;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 1.4, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  // Stars are light, not matter: the raycaster counts Points too (a
  // hit within 1 m), so a shot could "land" on a star far above the
  // city and never reach the dummy. Turn the test off for them.
  stars.raycast = () => {};
  scene.add(stars);

  // --- the moon: a pale disc opposite the sun, and its cold light ---------
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0, fog: false }),
  );
  scene.add(moon);
  const moonLight = new THREE.DirectionalLight(0x8fa8cc, 0);
  scene.add(moonLight);

  // --- the rain: a box of falling points that follows the player -----------
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i += 1) {
    rainPos[i * 3] = (rand() - 0.5) * 60;
    rainPos[i * 3 + 1] = rand() * 28;
    rainPos[i * 3 + 2] = (rand() - 0.5) * 60;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xa8c0d8, size: 0.22, transparent: true, opacity: 0, depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  // The rain box follows the player, so drops hover right by the muzzle:
  // a round would "hit" a drop a hand's breadth out and stop there,
  // never reaching anything solid. Rain is weather, not a wall.
  rain.raycast = () => {};
  scene.add(rain);

  // --- the lightning bolt: a jagged line, only there for the flash --------
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  const boltMat = new THREE.LineBasicMaterial({
    color: 0xf2f6ff, transparent: true, opacity: 0, fog: false,
  });
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.frustumCulled = false;
  // The bolt is a flash of light, not a wall: rounds fly straight past it.
  bolt.raycast = () => {};
  scene.add(bolt);

  function strikeBolt(playerX, playerZ) {
    // A jagged path from the clouds to the ground, somewhere near the player.
    const bx = playerX + (Math.random() - 0.5) * 90;
    const bz = playerZ + (Math.random() - 0.5) * 90;
    const pos = boltGeo.attributes.position.array;
    let x = bx;
    let z = bz;
    for (let i = 0; i < 12; i += 1) {
      const y = 60 - (i / 11) * 60;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      x += (Math.random() - 0.5) * 7;
      z += (Math.random() - 0.5) * 7;
    }
    boltGeo.attributes.position.needsUpdate = true;
  }

  // --- the lamp pools: warm point lights at every other lamp --------------
  const lampLights = [];
  world.lampPositions.forEach(({ x, z }, i) => {
    if (i % 2 !== 0) return; // every other lamp carries a real light
    const light = new THREE.PointLight(0xffc46b, 0, 20, 1.8);
    light.position.set(x, 5.1, z);
    scene.add(light);
    lampLights.push(light);
  });

  // --- the driven ride's headlight beam: one spotlight, aimed ahead --------
  const beam = new THREE.SpotLight(0xfff2c0, 0, 34, 0.55, 0.5, 1.2);
  const beamTarget = new THREE.Object3D();
  scene.add(beamTarget);
  beam.target = beamTarget;
  scene.add(beam);

  /** Pick the next weather: weighted, and never the one it just had. */
  function pickWeather() {
    let next = weather;
    while (next === weather) {
      const roll = Math.random();
      let acc = 0;
      for (let i = 0; i < WEATHERS.length; i += 1) {
        acc += WEATHER_WEIGHTS[i];
        if (roll <= acc) { next = WEATHERS[i]; break; }
      }
    }
    weather = next;
  }

  /** Apply the current hour and weather to every light, sky and surface. */
  function apply(dt, state) {
    // --- the sun and the moon ----------------------------------------------
    // The sun rises at 6h in the east and sets at 18h in the west; the
    // moon keeps the opposite half of the arc, so one is always up.
    const theta = ((hours - 6) / 12) * Math.PI;
    const sunElev = Math.sin(theta);
    const daylight = smoothstep(-0.08, 0.22, sunElev);
    nightFactor = 1 - daylight;
    const sun = world.sun;
    sun.position.set(Math.cos(theta) * 70, sunElev * 60 + 4, 25);
    const weatherSun = weather === 'RAIN' ? 0.35 : weather === 'FOG' ? 0.25 : weather === 'STORM' ? 0.15 : 1;
    sun.intensity = daylight * 2.6 * weatherSun;
    sun.color.copy(tmpColor.setHex(0xffd9a0)).lerp(tmpColor2.setHex(0xfff2d0), clamp01(sunElev * 1.5));
    sun.castShadow = daylight > 0.15;
    const phi = theta + Math.PI;
    const moonElev = Math.sin(phi);
    const moonUp = smoothstep(-0.05, 0.2, moonElev);
    moon.position.set(Math.cos(phi) * 90, moonElev * 70 + 5, -40);
    moon.lookAt(state.player.x, 0, state.player.z);
    moon.material.opacity = moonUp * (0.4 + 0.6 * nightFactor);
    moonLight.position.set(Math.cos(phi) * 60, moonElev * 50 + 10, -30);
    moonLight.intensity = moonUp * 0.4;

    // --- the fill light and the stars ---------------------------------------
    const hemi = world.hemi;
    hemi.intensity = 0.25 + daylight * 0.65 + flash * 1.2;
    hemi.color.copy(tmpColor.setHex(0x1a2440)).lerp(tmpColor2.setHex(0xbcd8ee), daylight);
    hemi.groundColor.copy(tmpColor.setHex(0x0e0c10)).lerp(tmpColor2.setHex(0x8a7a5e), daylight);
    starMat.opacity = nightFactor * 0.9;

    // --- the sky (redrawn a few times a second, not every frame) ------------
    skyTimer -= dt;
    if (skyTimer <= 0 || flash > 0) {
      drawSky();
      skyTimer = 0.25;
    }

    // --- the fog: thick when it fogs, close when it rains --------------------
    const fog = scene.fog;
    if (fog) {
      skyColorsAt(hours, topColor, horizonColor);
      fog.color.copy(horizonColor).multiplyScalar(0.85);
      if (weather === 'FOG') {
        fog.color.lerp(paleColor, 0.4);
        fog.near = 8; fog.far = 55;
      } else if (weather === 'RAIN') {
        fog.near = 45; fog.far = 140;
      } else if (weather === 'STORM') {
        fog.near = 30; fog.far = 110;
      } else {
        fog.near = 70 - nightFactor * 20;
        fog.far = 190 - nightFactor * 40;
      }
    }

    // --- the rain: how hard it falls, and the drops themselves --------------
    const targetRain = weather === 'RAIN' ? 0.7 : weather === 'STORM' ? 1 : 0;
    rainLevel += (targetRain - rainLevel) * Math.min(1, dt * 2);
    if (rainLevel > 0.02) {
      const speed = weather === 'STORM' ? 34 : 26;
      const count = Math.floor(RAIN_COUNT * rainLevel);
      rainGeo.setDrawRange(0, count);
      rainMat.opacity = rainLevel * 0.85;
      rain.position.set(state.player.x, 0, state.player.z);
      const arr = rainGeo.attributes.position.array;
      for (let i = 0; i < count; i += 1) {
        arr[i * 3 + 1] -= speed * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 28;
          arr[i * 3] = (Math.random() - 0.5) * 60;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 60;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      rainMat.opacity = 0;
    }

    // --- the lightning: a strike, a flash, a bolt, then it is gone ----------
    if (weather === 'STORM' && !state.frozen) {
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        flash = 1;
        strikeBolt(state.player.x, state.player.z);
        lightningTimer = 4 + Math.random() * 5;
      }
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 7);
      boltMat.opacity = flash > 0.3 ? 0.9 : 0;
    } else {
      boltMat.opacity = 0;
    }

    // --- the lamps, the windows, the neon, the wet roads ---------------------
    world.lampMat.emissiveIntensity = 0.25 + nightFactor * 1.95;
    for (const light of lampLights) light.intensity = nightFactor * 60;
    for (const b of world.buildings) b.material.emissiveIntensity = nightFactor * 0.85;
    for (const n of world.neonSigns) {
      n.material.color.copy(n.bright).multiplyScalar(0.22 + 0.78 * nightFactor);
    }
    const wet = rainLevel;
    world.asphalt.roughness = 0.95 - wet * 0.7;
    world.asphalt.metalness = 0.05 + wet * 0.25;
    world.cloudMat.color.copy(tmpColor.setHex(0xffffff));
    if (weather === 'RAIN') world.cloudMat.color.lerp(greyColor, 0.45);
    else if (weather === 'STORM') world.cloudMat.color.lerp(greyColor, 0.6);
    else if (weather === 'FOG') world.cloudMat.color.lerp(paleColor, 0.3);
    world.cloudMat.color.lerp(tmpColor.setHex(0x2a3040), nightFactor * 0.7);
    world.cloudMat.opacity = 0.9 - nightFactor * 0.35;

    // --- the driven ride's beam: on after dark, aimed down the road ---------
    const driven = state.driven;
    if (driven) {
      const fx = Math.sin(driven.yaw);
      const fz = Math.cos(driven.yaw);
      beam.position.set(
        driven.group.position.x + fx * 2.2,
        0.7,
        driven.group.position.z + fz * 2.2,
      );
      beamTarget.position.set(
        driven.group.position.x + fx * 14,
        0.2,
        driven.group.position.z + fz * 14,
      );
      beam.intensity = nightFactor * 70;
    } else {
      beam.intensity = 0;
    }
  }

  // The first frame is golden hour, so apply once before the loop runs.
  apply(0, { player: { x: 0, z: 10 }, driven: null, frozen: true });

  return {
    /** The game clock, in hours (0–24). */
    get hours() { return hours; },
    /** 'CLEAR' | 'RAIN' | 'FOG' | 'STORM'. */
    get weather() { return weather; },
    /** 'NIGHT' | 'DAWN' | 'DAY' | 'GOLDEN HOUR' | 'DUSK'. */
    get phase() { return phaseFor(hours); },
    /** 0 = full day, 1 = full night. */
    get night() { return nightFactor; },
    /** The lightning flash, 1 at the strike decaying to 0 (tests watch this). */
    get lightning() { return flash; },
    /** The clock as the HUD prints it ("17:30"). */
    get clockText() {
      const h = Math.floor(hours) % 24;
      const m = Math.floor((hours % 1) * 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    /** Jump the clock to an hour at once (tests and the T key use this). */
    setTime(nextHours) {
      hours = ((nextHours % 24) + 24) % 24;
      apply(0, { player: { x: 0, z: 10 }, driven: null, frozen: true });
    },
    /** Set the weather at once (tests use this; the C key cycles instead). */
    setWeather(next) {
      if (!WEATHERS.includes(next)) return false;
      weather = next;
      weatherTimer = WEATHER_HOLD_SECONDS;
      rainLevel = next === 'RAIN' ? 0.7 : next === 'STORM' ? 1 : 0;
      apply(0, { player: { x: 0, z: 10 }, driven: null, frozen: true });
      return true;
    },
    /** Step the weather on: CLEAR → RAIN → FOG → STORM → CLEAR. */
    cycleWeather() {
      weather = WEATHERS[(WEATHERS.indexOf(weather) + 1) % WEATHERS.length];
      weatherTimer = WEATHER_HOLD_SECONDS;
      return weather;
    },
    /** Jump the clock ahead by `by` hours (the T key: +2). */
    advanceTime(by) {
      hours = (hours + by) % 24;
    },
    /**
     * Step 12: graphics quality. LOW draws fewer rain drops and stars
     * (a quarter of each); HIGH draws them all. The buffers never
     * change, only how many of them the renderer draws.
     */
    setQuality(q) {
      rainGeo.setDrawRange(0, q === 'low' ? 400 : RAIN_COUNT);
      starGeo.setDrawRange(0, q === 'low' ? 120 : starCount);
    },
    /**
     * One frame. `state` carries the player position (the rain follows it),
     * the ride Raka is driving (its beam), and `frozen` for a staged
     * screenshot frame — frozen frames hold the light, they never advance
     * the clock or turn the weather.
     */
    update(dt, state) {
      if (!state.frozen) {
        hours = (hours + (dt * 24) / CYCLE_SECONDS) % 24;
        weatherTimer -= dt;
        if (weatherTimer <= 0) {
          pickWeather();
          weatherTimer = WEATHER_HOLD_SECONDS * (0.8 + Math.random() * 0.4);
        }
      }
      apply(dt, state);
    },
  };
}
