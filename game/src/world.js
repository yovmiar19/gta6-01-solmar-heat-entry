// The city of Solmar Bay: ground, streets, buildings, lamps, palms, clouds,
// the golden-hour sun and the haze. Everything is generated in code from a seed,
// so the same seed always builds the same city (the screenshots use seed 7).
//
// Layout: one main avenue runs north–south down x = 0, crossed by three streets
// running east–west. Buildings fill the blocks between the streets. The hero
// starts on the main avenue, facing north into the city.

/** A small deterministic random generator (mulberry32) so a seed rebuilds the same city. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a building facade (base colour + a grid of windows, some lit) on a canvas. */
function makeFacadeTexture(base, litRatio, rand) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 256);
  // A slightly darker band at the bottom (the shopfront) and at the top (the cornice).
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 224, 128, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, 128, 10);
  // Window grid: 4 columns, 8 rows.
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rand() < litRatio;
      ctx.fillStyle = lit ? '#ffd97a' : 'rgba(20,28,40,0.85)';
      ctx.fillRect(10 + col * 30, 18 + row * 26, 18, 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A windows-only glow map for a facade: black everywhere except the lit windows. */
function makeWindowGlowTexture(litRatio, rand) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 128, 256);
  // Same window grid as the facade (4 columns, 8 rows), so the glow lines
  // up with the windows drawn on the day texture.
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (rand() < litRatio) {
        ctx.fillStyle = '#ffd97a';
        ctx.fillRect(10 + col * 30, 18 + row * 26, 18, 16);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A vertical sky gradient (blue above, warm gold at the horizon) as a texture. */
function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#6fa8d8');
  grad.addColorStop(0.45, '#a8c8e2');
  grad.addColorStop(0.72, '#f2d3a0');
  grad.addColorStop(1.0, '#ffcf8a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the city into `scene` and return the playable bounds, the building
 * footprints (for car collision) and an update step (the clouds drift).
 * `seed` picks the building heights, colours and props.
 */
export function createWorld(scene, seed) {
  const rand = mulberry32(seed);
  const bounds = 55; // the hero is clamped to [-bounds, bounds] on x and z
  const colliders = []; // building footprints, filled in as the blocks go up

  // --- sky, fog and light -------------------------------------------------
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xe8d9b8, 70, 190);

  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(-40, 55, 25); // low in the west: golden hour
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbcd8ee, 0x8a7a5e, 0.9);
  scene.add(hemi);

  // --- ground --------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ color: 0x7d7a6e, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- streets -------------------------------------------------------------
  // The main avenue (north–south, x = 0) and three cross streets (east–west).
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.95 });
  const sidewalk = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 1 });
  function roadStrip(width, length, x, z) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, length), asphalt);
    strip.position.set(x, 0.06, z);
    strip.receiveShadow = true;
    scene.add(strip);
    // Pale sidewalks along both edges.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.14, length), sidewalk);
    walk.position.set(x, 0.02, z);
    walk.receiveShadow = true;
    scene.add(walk);
  }
  roadStrip(10, 130, 0, 0); // main avenue
  for (const z of [-30, 0, 30]) roadStrip(130, 8, 0, z); // cross streets

  // A warm centre line down the main avenue (thin boxes, dashed).
  const centreLine = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.8 });
  for (let z = -58; z <= 58; z += 6) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 3), centreLine);
    dash.position.set(0, 0.14, z);
    scene.add(dash);
  }

  // --- buildings -----------------------------------------------------------
  // Facade textures in a few warm colours, reused across the blocks. Each
  // facade is a pair: the day map and its windows-only glow map, which the
  // environment lights up at night so the windows shine warm yellow.
  const facades = [
    { map: makeFacadeTexture('#e8d9b0', 0.35, rand), glow: makeWindowGlowTexture(0.6, rand) },
    { map: makeFacadeTexture('#d9905f', 0.3, rand), glow: makeWindowGlowTexture(0.55, rand) },
    { map: makeFacadeTexture('#7fa8a0', 0.3, rand), glow: makeWindowGlowTexture(0.6, rand) },
    { map: makeFacadeTexture('#e8b48a', 0.35, rand), glow: makeWindowGlowTexture(0.55, rand) },
    { map: makeFacadeTexture('#c9b8d8', 0.25, rand), glow: makeWindowGlowTexture(0.5, rand) },
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 });
  const buildings = []; // each building's facade material, for the night glow

  function addBuilding(x, z, width, depth, height, facade) {
    const block = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      map: facade.map,
      roughness: 0.9,
      emissiveMap: facade.glow,
      emissive: 0xffc46b,
      emissiveIntensity: 0, // the environment raises this after dark
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      bodyMat,
    );
    body.position.y = height / 2;
    body.castShadow = true; body.receiveShadow = true;
    block.add(body);
    buildings.push({ material: bodyMat });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.5, depth + 0.4), roofMat);
    roof.position.y = height + 0.25;
    roof.castShadow = true;
    block.add(roof);
    // A rooftop box (air conditioning / water tank) for silhouette.
    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 1 }),
    );
    tank.position.set(width * 0.2, height + 1.1, -depth * 0.15);
    tank.castShadow = true;
    block.add(tank);
    block.position.set(x, 0, z);
    scene.add(block);
  }

  // Blocks between the streets, set back from the roads. (x, z, w, d, h)
  const plots = [
    [-20, -45, 14, 12, 18], [20, -45, 12, 12, 14], [-20, -15, 12, 12, 22],
    [20, -15, 14, 12, 10], [-20, 15, 13, 12, 16], [20, 15, 12, 12, 24],
    [-20, 45, 12, 12, 12], [20, 45, 14, 12, 18], [-38, -15, 12, 12, 14],
    [38, -15, 12, 12, 20], [-38, 15, 12, 12, 10], [38, 15, 12, 12, 16],
    [-38, -45, 12, 12, 18], [38, -45, 12, 12, 12], [-38, 45, 12, 12, 22],
    [38, 45, 12, 12, 14],
  ];
  for (const [x, z, w, d, h] of plots) {
    const height = h * (0.85 + rand() * 0.4);
    addBuilding(x, z, w, d, height, facades[Math.floor(rand() * facades.length)]);
    // The building's footprint, grown a little, so cars cannot clip its walls.
    colliders.push({ minX: x - w / 2 - 0.3, maxX: x + w / 2 + 0.3, minZ: z - d / 2 - 0.3, maxZ: z + d / 2 + 0.3 });
  }

  // --- street lamps ---------------------------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6, metalness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc46b, emissiveIntensity: 1.6 });
  const lampPositions = []; // every lamp head, for the night light pools
  function addLamp(x, z) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 8), poleMat);
    pole.position.y = 2.6; pole.castShadow = true;
    lamp.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.35), lampMat);
    head.position.set(0.5, 5.3, 0);
    lamp.add(head);
    lamp.position.set(x, 0, z);
    scene.add(lamp);
    lampPositions.push({ x, z });
  }
  for (const z of [-52, -38, -22, -8, 8, 22, 38, 52]) {
    addLamp(-6.2, z); addLamp(6.2, z);
  }

  // --- neon signs -----------------------------------------------------------
  // Four glowing shop signs on the avenue-facing buildings, one per colour.
  // They are dim by day and blaze after dark (the environment drives them).
  const neonSigns = [];
  const neonColours = [0x35e0ff, 0xff5fa2, 0xff9a3d, 0x8dff5e];
  const neonPlots = [[-20, -15, 12], [20, -15, 14], [-20, 15, 13], [20, 15, 12]];
  neonPlots.forEach(([px, pz, w], i) => {
    const facingEast = px < 0; // the sign hangs on the avenue side of the block
    const signX = facingEast ? px + w / 2 + 0.08 : px - w / 2 - 0.08;
    const bright = new THREE.Color(neonColours[i]);
    const mat = new THREE.MeshBasicMaterial({ color: bright.clone().multiplyScalar(0.22), toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), mat);
    sign.position.set(signX, 5.5, pz);
    sign.rotation.y = facingEast ? Math.PI / 2 : -Math.PI / 2;
    scene.add(sign);
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.0, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.8 }),
    );
    backing.position.set(facingEast ? signX - 0.06 : signX + 0.06, 5.5, pz);
    scene.add(backing);
    neonSigns.push({ material: mat, bright });
  });

  // --- palm trees -----------------------------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 });
  function addPalm(x, z) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.6, 8), trunkMat);
    trunk.position.y = 2.3; trunk.castShadow = true;
    palm.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.6), leafMat);
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 1.1, 4.9, Math.sin(angle) * 1.1);
      leaf.rotation.y = -angle;
      leaf.rotation.x = 0.5;
      leaf.castShadow = true;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    scene.add(palm);
  }
  const palmSpots = [[-8, -20], [8, -42], [-8, 12], [8, 26], [-8, 48], [8, -4], [-8, -52], [8, 44]];
  for (const [x, z] of palmSpots) addPalm(x, z);

  // --- vaultable obstacles (step 10) ----------------------------------------
  // Low crates and seawall segments Raka can jump over, vault, or climb
  // onto: wooden crates (0.9 m) tucked against the buildings at the
  // sidewalks' edges, and low concrete seawalls (1.0 m) along the sand at
  // the beach. Each carries its footprint and its top height, so the game
  // loop can ask how high the ground is under Raka and push him out of
  // one he walks into on foot.
  const vaultables = []; // { x, z, hw, hd, h } — centre, half extents, top height
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 1 });
  const crateTrimMat = new THREE.MeshStandardMaterial({ color: 0x6e5636, roughness: 1 });
  function addCrate(x, z) {
    const crate = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), crateMat);
    body.position.y = 0.45; body.castShadow = true; body.receiveShadow = true;
    crate.add(body);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.1, 1.28), crateTrimMat);
    trim.position.y = 0.86; trim.castShadow = true;
    crate.add(trim);
    crate.position.set(x, 0, z);
    scene.add(crate);
    vaultables.push({ x, z, hw: 0.6, hd: 0.6, h: 0.9 });
  }
  addCrate(-9, -12); addCrate(9, 18); addCrate(-9, 38); addCrate(9, -38);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 1 });
  function addSeawall(x, z) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 1.0, 1), wallMat);
    wall.position.set(x, 0.5, z);
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);
    vaultables.push({ x, z, hw: 2, hd: 0.5, h: 1.0 });
  }
  addSeawall(-8, 76); addSeawall(8, 76);

  /**
   * The ground height at a spot: an obstacle's top while the spot is on
   * one, the street (0) anywhere else.
   */
  function groundHeightAt(x, z) {
    for (const v of vaultables) {
      if (x >= v.x - v.hw && x <= v.x + v.hw && z >= v.z - v.hd && z <= v.z + v.hd) return v.h;
    }
    return 0;
  }

  /**
   * Push a point out of a vaultable it has walked into (on foot, below the
   * top): the nearest edge, so crates and walls are solid at street level.
   * A point already on top of one is left alone.
   */
  function pushOutOfVaultable(x, z, radius) {
    for (const v of vaultables) {
      const cx = Math.max(v.x - v.hw, Math.min(v.x + v.hw, x));
      const cz = Math.max(v.z - v.hd, Math.min(v.z + v.hd, z));
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d < 0.001) {
        // Dead centre: shove out along the shorter axis.
        if (v.hw < v.hd) return { x: v.x + (x >= v.x ? v.hw + radius : -v.hw - radius), z };
        return { x, z: v.z + (z >= v.z ? v.hd + radius : -v.hd - radius) };
      }
      const push = (radius - d) / d;
      return { x: x + dx * push, z: z + dz * push };
    }
    return { x, z };
  }

  // --- clouds ---------------------------------------------------------------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < 6; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rand() * 1.6, 10, 8), cloudMat);
      puff.position.set(j * 2.6 - 2.6, rand() * 0.8, rand() * 1.5 - 0.75);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-70 + rand() * 140, 34 + rand() * 10, -80 + rand() * 120);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    bounds,
    colliders,
    /** The low obstacles Raka can vault or climb (step 10): crates and seawalls. */
    vaultables,
    /** The ground height at a spot: an obstacle's top, or 0 on the street. */
    groundHeightAt,
    /** Push a point out of a vaultable it walked into (on foot, below the top). */
    pushOutOfVaultable,
    /** The golden-hour sun, so the environment can move and dim it. */
    sun,
    /** The sky/ground fill light, so the environment can cool it at night. */
    hemi,
    /** The road surface, so rain can make it glossy. */
    asphalt,
    /** The shared lamp-head material, so the lamps can glow after dark. */
    lampMat,
    /** Every lamp head's ground position, for the night light pools. */
    lampPositions,
    /** Each building's facade material, for the lit windows at night. */
    buildings,
    /** The neon shop signs and their full-bright colours. */
    neonSigns,
    /** The building plots, so the environment can hang things on them. */
    plots,
    /** The shared cloud material, so weather can grey the clouds. */
    cloudMat,
    /** Drift the clouds slowly across the sky. */
    update(dt) {
      for (const cloud of clouds) {
        cloud.position.x += dt * 0.6;
        if (cloud.position.x > 90) cloud.position.x = -90;
      }
    },
  };
}
