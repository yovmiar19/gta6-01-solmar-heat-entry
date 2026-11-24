// Step 14 — Sun Idols: 30 gold idols hidden across Solmar Bay's seven
// districts, about four or five in each. An idol bobs, spins and glows
// softly, so it reads in a screenshot from across the street; walking
// (or jumping) into one picks it up with a short chime. A pickup pays a
// little cash and warms up the district it sits in, and the radar shows
// a gold blip for every idol still out there within about 150 metres.
// Every ten idols unlocks a visible reward: ten repaints the Sunset GT
// gold, twenty gives Raka a gold jacket, and all thirty turn the phone
// gold and pay a $1,000 bonus. The film-roll idea (ten hidden rolls
// unlocking photo cutaways) was cut for the deadline — the idols and
// the jumps come first, and a roll hunt would have needed its own
// gallery screen on top of them.

import { districtAt } from './districts.js';

export const IDOL_TOTAL = 30;
const PICKUP_RANGE = 2.2; // horizontal metres from the idol's centre
const PICKUP_HEIGHT = 1.7; // how far above or below chest height it still counts
const BLIP_RANGE = 150; // metres: an idol further out stays off the radar
const CASH_PER_IDOL = 25; // dollars banked per pickup
const STANDING_PER_IDOL = 2; // district standing per pickup
export const REWARD_TIERS = [10, 20, 30]; // idol counts that unlock a reward

// Where the idols stand: (x, z, height). Heights are chest-high on the
// street (1.4) or a jump higher (2.0–2.2) where a crate, a seawall, a
// beach arch or a boat deck puts one just out of a walk's reach — a
// plain jump (about 1.05 m at the feet) still closes the gap. Every
// spot is on open ground, a sidewalk, the sand or a boat deck, never
// inside a building footprint. Counts per district: Lantern Mile 5,
// Old Pasaru 4, Lantawa Centre 4, Banyan Green 4, Market Row 4,
// Wanaru Terraces 4, Kumala Strand 5.
const SPOTS = [
  // Lantern Mile — the north end of the avenue.
  { x: 0, z: -52, y: 1.4 }, { x: -13, z: -38, y: 1.4 }, { x: 13, z: -52, y: 1.4 },
  { x: -32, z: -34, y: 2.2 }, { x: 32, z: -36, y: 1.4 },
  // Old Pasaru — west blocks, north of the middle street.
  { x: -13, z: -22, y: 1.4 }, { x: -32, z: -8, y: 2.2 },
  { x: -45, z: -18, y: 1.4 }, { x: -9, z: -4, y: 1.4 },
  // Lantawa Centre — the avenue itself.
  { x: 0, z: -18, y: 1.4 }, { x: 0, z: 12, y: 1.4 },
  { x: -6, z: 28, y: 1.4 }, { x: 6, z: -2, y: 2.2 },
  // Banyan Green — east blocks, north of the middle street.
  { x: 13, z: -22, y: 1.4 }, { x: 32, z: -8, y: 1.4 },
  { x: 45, z: -18, y: 2.2 }, { x: 9, z: -28, y: 1.4 },
  // Market Row — west blocks, south of the middle street.
  { x: -13, z: 8, y: 1.4 }, { x: -32, z: 22, y: 1.4 },
  { x: -45, z: 12, y: 2.2 }, { x: -9, z: 18, y: 1.4 },
  // Wanaru Terraces — east blocks, south of the middle street.
  { x: 13, z: 8, y: 1.4 }, { x: 32, z: 22, y: 1.4 },
  { x: 45, z: 12, y: 1.4 }, { x: 9, z: 18, y: 2.2 }, // above the crate at (9, 18)
  // Kumala Strand — the beachfront, the sand and the sea.
  { x: 0, z: 44, y: 1.4 }, { x: -8, z: 76, y: 2.0 }, // on the seawall at (-8, 76)
  { x: 20, z: 66, y: 2.2 }, // under the beach arch
  { x: 12, z: 96, y: 1.4 }, // over the Speedboat's deck
  { x: -16, z: 104, y: 1.4 }, // over the Fishing Boat's deck
];

/** A soft radial glow, drawn once on a canvas and shared by every idol. */
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 220, 110, 0.9)');
  grad.addColorStop(0.4, 'rgba(255, 190, 60, 0.35)');
  grad.addColorStop(1, 'rgba(255, 190, 60, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCollectibles(scene, hooks = {}) {
  const onPickup = hooks.onPickup ?? (() => {});
  const onReward = hooks.onReward ?? (() => {});
  const glowTexture = makeGlowTexture();
  const collected = new Set(); // idol ids already picked up
  const rewards = new Set(); // reward tiers already unlocked (10 / 20 / 30)
  const idols = [];
  let pulseTime = 0;

  // --- the beach arch at (20, 66): two sandstone posts and a lintel, so
  // the idol hanging under it reads as a landmark, not a floating rock.
  const archMat = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 1 });
  for (const dx of [-1.6, 1.6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), archMat);
    post.position.set(20 + dx, 1.6, 66);
    post.castShadow = true;
    scene.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 0.6), archMat);
  lintel.position.set(20, 3.4, 66);
  lintel.castShadow = true;
  scene.add(lintel);

  for (let i = 0; i < SPOTS.length; i += 1) {
    const spot = SPOTS[i];
    const group = new THREE.Group();
    // The idol itself: a small gold octahedron, emissive so it glows
    // even after dark, spinning slowly over a thin gold ring on the
    // ground that marks the spot from a distance.
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35),
      new THREE.MeshStandardMaterial({
        color: 0xf2c94c, roughness: 0.25, metalness: 0.7,
        emissive: 0xaa7700, emissiveIntensity: 0.55,
      }),
    );
    core.castShadow = true;
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, transparent: true, depthWrite: false,
    }));
    glow.scale.set(2.2, 2.2, 1);
    group.add(glow);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -spot.y + 0.06;
    group.add(ring);
    group.position.set(spot.x, spot.y, spot.z);
    scene.add(group);
    const district = districtAt(spot.x, spot.z);
    idols.push({
      id: i, x: spot.x, z: spot.z, y: spot.y,
      districtId: district.id, districtName: district.name,
      group, core, glow,
    });
  }

  /**
   * One frame: the idols bob and spin, and the player's chest is
   * checked against each one still out there. `player` is
   * { x, z, chestY } — chest height, so a jump closes the gap to a
   * high idol and a swim still reaches a boat-deck one.
   */
  function update(dt, player) {
    pulseTime += dt;
    for (const idol of idols) {
      if (collected.has(idol.id)) continue;
      idol.core.rotation.y += dt * 1.6;
      idol.group.position.y = idol.y + Math.sin(pulseTime * 2 + idol.id * 1.3) * 0.15;
      const glowPulse = 1 + 0.2 * Math.sin(pulseTime * 3 + idol.id);
      idol.glow.scale.set(2.2 * glowPulse, 2.2 * glowPulse, 1);
      if (!player) continue;
      const dx = player.x - idol.x;
      const dz = player.z - idol.z;
      if (Math.hypot(dx, dz) > PICKUP_RANGE) continue;
      if (Math.abs(idol.group.position.y - player.chestY) > PICKUP_HEIGHT) continue;
      collect(idol);
    }
  }

  /** Pick an idol up: hide it, count it, pay it, and unlock its tier. */
  function collect(idol) {
    if (collected.has(idol.id)) return false;
    collected.add(idol.id);
    idol.group.visible = false;
    onPickup({
      id: idol.id,
      count: collected.size,
      total: IDOL_TOTAL,
      districtId: idol.districtId,
      districtName: idol.districtName,
      cash: CASH_PER_IDOL,
      standing: STANDING_PER_IDOL,
    });
    for (const tier of REWARD_TIERS) {
      if (collected.size >= tier && !rewards.has(tier)) {
        rewards.add(tier);
        onReward(tier, { restored: false, count: collected.size });
      }
    }
    return true;
  }

  return {
    /** How many idols Raka has picked up. */
    get count() { return collected.size; },
    /** How many idols there are in total (30). */
    get total() { return IDOL_TOTAL; },
    /** Every idol with its spot, its district and whether it is taken. */
    get list() {
      return idols.map((idol) => ({
        id: idol.id, x: idol.x, z: idol.z, y: idol.y,
        district: idol.districtName, collected: collected.has(idol.id),
      }));
    },
    /** The reward tiers unlocked so far (10 / 20 / 30). */
    get unlockedRewards() { return [...rewards].sort((a, b) => a - b); },
    /** The idols still out there within `range` metres of a spot. */
    blipsNear(x, z, range = BLIP_RANGE) {
      const out = [];
      for (const idol of idols) {
        if (collected.has(idol.id)) continue;
        if (Math.hypot(idol.x - x, idol.z - z) <= range) out.push({ x: idol.x, z: idol.z });
      }
      return out;
    },
    /**
     * Draw the nearby idols' gold blips onto the radar canvas, after
     * the radar itself has drawn (it clears the canvas every frame, so
     * this runs after it). The conversion matches the radar's own:
     * the map covers x/z -60..60, with a 20px sea band at the bottom.
     */
    drawRadarBlips(x, z) {
      const canvas = document.getElementById('radar');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const SIZE = 300;
      const RANGE = 60;
      const SCALE = SIZE / (RANGE * 2);
      const pulse = 1 + 0.25 * Math.sin(performance.now() / 1000 * 5);
      for (const b of this.blipsNear(x, z)) {
        const px = (b.x + RANGE) * SCALE;
        const py = b.z <= RANGE
          ? (b.z + RANGE) * SCALE
          : SIZE - 20 + ((b.z - RANGE) / 60) * 20;
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath();
        ctx.moveTo(px, py - 7 * pulse);
        ctx.lineTo(px + 5 * pulse, py);
        ctx.lineTo(px, py + 7 * pulse);
        ctx.lineTo(px - 5 * pulse, py);
        ctx.closePath();
        ctx.fill();
      }
    },
    update,
    /** Pick an idol up at once (the test harness walks Raka onto one). */
    collectById(id) {
      const idol = idols[id];
      if (!idol) return false;
      return collect(idol);
    },
    /** Put every idol back (a fresh start after a respawn resets nothing else). */
    reset() {
      collected.clear();
      rewards.clear();
      for (const idol of idols) idol.group.visible = true;
    },
    /** The collected ids and unlocked tiers, for a save. */
    snapshot() {
      return { collected: [...collected], rewards: [...rewards] };
    },
    /**
     * Put a saved haul back: taken idols stay hidden, and unlocked
     * rewards re-apply their look (no cash twice — the `restored`
     * flag tells the game loop to skip the payout).
     */
    restore(saved) {
      if (!saved || typeof saved !== 'object') return;
      const taken = Array.isArray(saved.collected) ? saved.collected : [];
      for (const id of taken) {
        const idol = idols[id];
        if (!idol || collected.has(id)) continue;
        collected.add(id);
        idol.group.visible = false;
      }
      const tiers = Array.isArray(saved.rewards) ? saved.rewards : [];
      for (const tier of tiers) {
        if (REWARD_TIERS.includes(tier) && !rewards.has(tier)) {
          rewards.add(tier);
          onReward(tier, { restored: true, count: collected.size });
        }
      }
      // A save from before the rewards existed still unlocks them:
      // the count alone earns the tier, without paying twice.
      for (const tier of REWARD_TIERS) {
        if (collected.size >= tier && !rewards.has(tier)) {
          rewards.add(tier);
          onReward(tier, { restored: true, count: collected.size });
        }
      }
    },
  };
}
