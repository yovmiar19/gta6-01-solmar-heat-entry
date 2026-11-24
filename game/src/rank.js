// Step 13 — rank and reputation points (RP), Karimbu-style.
// Raka starts at RANK 1 with 0 / 300 RP. A story mission pays 100 RP,
// a side job pays 50. The ranks climb at 300, 750 and 1500 RP; RANK 4
// is the top, with no ceiling above it. A rank-up is worth a banner
// and a chime, so the game loop can celebrate it when it happens.

export const RANK_THRESHOLDS = [0, 300, 750, 1500]; // RP a rank starts at
export const RP_PER_MISSION = 100; // a story mission's RP
export const RP_PER_JOB = 50; // a side job's RP

/** The rank a total of RP sits at (1–4). */
export function rankFor(rp) {
  let rank = 1;
  for (let i = 0; i < RANK_THRESHOLDS.length; i += 1) {
    if (rp >= RANK_THRESHOLDS[i]) rank = i + 1;
  }
  return rank;
}

export function createRank() {
  let rp = 0; // reputation points banked so far

  return {
    /** Reputation points banked so far. */
    get rp() { return rp; },
    /** The rank those points sit at (1–4). */
    get rank() { return rankFor(rp); },
    /**
     * The RP the next rank starts at, or null at the top rank (RANK 4
     * has no ceiling above it).
     */
    get nextThreshold() {
      const r = rankFor(rp);
      return r >= RANK_THRESHOLDS.length ? null : RANK_THRESHOLDS[r];
    },
    /**
     * Progress inside the current rank, as [earned, needed]: the RP
     * banked since this rank started, and the RP the rank spans. At
     * the top rank the span is 0 and the bar reads full.
     */
    get progress() {
      const r = rankFor(rp);
      const floor = RANK_THRESHOLDS[r - 1];
      const next = r >= RANK_THRESHOLDS.length ? null : RANK_THRESHOLDS[r];
      return { earned: rp - floor, needed: next === null ? 0 : next - floor };
    },

    /**
     * Bank RP (a mission or a job paid out). Returns whether the rank
     * went up and which rank Raka sits at now, so the game loop can
     * show the rank-up banner.
     */
    addRp(amount) {
      const before = rankFor(rp);
      rp = Math.max(0, rp + amount);
      const now = rankFor(rp);
      return { up: now > before, rank: now, rp };
    },

    /** The RP total, for a save. */
    snapshot() {
      return rp;
    },

    /** Put a saved RP total back (a load). */
    restore(savedRp) {
      if (typeof savedRp === 'number' && Number.isFinite(savedRp)) {
        rp = Math.max(0, Math.round(savedRp));
      }
      return rp;
    },
  };
}
