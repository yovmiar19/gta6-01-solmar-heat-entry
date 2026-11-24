// Step 13 — the districts of Solmar Bay and how they feel about Raka.
// The city is seven districts over the real map: the north end, the
// avenue core, the east and west blocks, and the beachfront south. Every
// district starts at 50 NEUTRAL. Finishing a side job in a district
// warms it up; committing a crime in one (hitting a pedestrian) cools
// it down. The label reads HOSTILE below 25, COLD below 40, NEUTRAL
// below 60, WARM below 80, FRIENDLY from 80 up.

export const DISTRICTS = [
  // The north end of the avenue, where the pier stands.
  { id: 'lantern', name: 'Lantern Mile', x0: -55, x1: 55, z0: -55, z1: -30 },
  // West of the avenue, north of the middle street.
  { id: 'oldpasaru', name: 'Old Pasaru', x0: -55, x1: -8, z0: -30, z1: 0 },
  // The avenue itself, the heart of the city.
  { id: 'lantawa', name: 'Lantawa Centre', x0: -8, x1: 8, z0: -30, z1: 30 },
  // East of the avenue, north of the middle street.
  { id: 'banyan', name: 'Banyan Green', x0: 8, x1: 55, z0: -30, z1: 0 },
  // West of the avenue, south of the middle street.
  { id: 'market', name: 'Market Row', x0: -55, x1: -8, z0: 0, z1: 30 },
  // East of the avenue, south of the middle street.
  { id: 'wanaru', name: 'Wanaru Terraces', x0: 8, x1: 55, z0: 0, z1: 30 },
  // The beachfront row, the sand and the sea beyond it.
  { id: 'kumala', name: 'Kumala Strand', x0: -55, x1: 55, z0: 30, z1: 116 },
];

const START_STANDING = 50; // every district starts NEUTRAL
const JOB_WARMTH = 8; // standing a finished job earns its home district
const IDOL_WARMTH = 2; // standing a Sun Idol pickup earns its home district
const CRIME_CHILL = 5; // standing a crime in a district costs it

/** The label for a standing score (0–100). */
export function standingLabel(score) {
  if (score < 25) return 'HOSTILE';
  if (score < 40) return 'COLD';
  if (score < 60) return 'NEUTRAL';
  if (score < 80) return 'WARM';
  return 'FRIENDLY';
}

/** The district a spot sits in (the first rectangle that holds it). */
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  // Outside every rectangle (past the sea's edge): the nearest is the beach.
  return DISTRICTS[DISTRICTS.length - 1];
}

export function createDistricts() {
  const standings = new Map();
  for (const d of DISTRICTS) standings.set(d.id, START_STANDING);

  function clamp(score) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  return {
    /** Every district with its standing and label, for the phone and the pause menu. */
    list() {
      return DISTRICTS.map((d) => ({
        id: d.id,
        name: d.name,
        x0: d.x0,
        x1: d.x1,
        z0: d.z0,
        z1: d.z1,
        standing: standings.get(d.id),
        label: standingLabel(standings.get(d.id)),
      }));
    },

    /** The district a spot sits in. */
    at(x, z) {
      return districtAt(x, z);
    },

    /** A district's standing score (0–100). */
    standing(id) {
      return standings.get(id) ?? START_STANDING;
    },

    /** A district's label (HOSTILE / COLD / NEUTRAL / WARM / FRIENDLY). */
    label(id) {
      return standingLabel(this.standing(id));
    },

    /**
     * A side job paid out in its home district: the district warms up.
     * Returns the new standing.
     */
    rewardJob(id, amount = JOB_WARMTH) {
      const next = clamp((standings.get(id) ?? START_STANDING) + amount);
      standings.set(id, next);
      return next;
    },

    /**
     * A Sun Idol picked up in a district (step 14): a small standing
     * bump, a couple of points — the district notices Raka finding its
     * hidden gold. Returns the new standing.
     */
    rewardIdol(id, amount = IDOL_WARMTH) {
      const next = clamp((standings.get(id) ?? START_STANDING) + amount);
      standings.set(id, next);
      return next;
    },

    /**
     * A crime at a spot (a pedestrian hit): the district there cools
     * down. Returns the new standing, or null when the spot has none.
     */
    noteCrimeAt(x, z, amount = CRIME_CHILL) {
      const d = districtAt(x, z);
      if (!d) return null;
      const next = clamp((standings.get(d.id) ?? START_STANDING) - amount);
      standings.set(d.id, next);
      return { id: d.id, name: d.name, standing: next };
    },

    /** The standings as a plain object, for a save. */
    snapshot() {
      const out = {};
      for (const d of DISTRICTS) out[d.id] = standings.get(d.id);
      return out;
    },

    /** Put saved standings back (a load). Foreign values are ignored. */
    restore(saved) {
      if (!saved || typeof saved !== 'object') return;
      for (const d of DISTRICTS) {
        const v = saved[d.id];
        if (typeof v === 'number' && Number.isFinite(v)) {
          standings.set(d.id, clamp(v));
        }
      }
    },
  };
}
