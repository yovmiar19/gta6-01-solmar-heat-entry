// Step 12 — save slots in localStorage. Three manual slots (1–3) plus
// one autosave slot the game writes itself when a mission pays out.
// A save is a plain JSON object; a broken or foreign value in a slot
// reads back as null, never as a crash — a bad save is an empty slot.

const PREFIX = 'solmar-heat-save-';
export const SAVE_SLOTS = [1, 2, 3, 'auto'];

/** The localStorage key for a slot. */
export function saveKey(slot) {
  return `${PREFIX}${slot}`;
}

/** Every slot with its parsed save, or null when it is empty or broken. */
export function listSaves() {
  return SAVE_SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(saveKey(slot));
      return { slot, data: raw ? JSON.parse(raw) : null };
    } catch {
      return { slot, data: null };
    }
  });
}

/** Read one slot's save, or null when it is empty or broken. */
export function readSave(slot) {
  try {
    const raw = localStorage.getItem(saveKey(slot));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Write a save object into a slot. False when storage refused it. */
export function writeSave(slot, data) {
  try {
    localStorage.setItem(saveKey(slot), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Empty every slot (manual and autosave). */
export function clearSaves() {
  for (const slot of SAVE_SLOTS) {
    try {
      localStorage.removeItem(saveKey(slot));
    } catch {
      // A slot that cannot be removed is left alone; the rest still clear.
    }
  }
}

/**
 * The newest save across all slots, or null when none exists. The
 * start overlay offers this one as CONTINUE.
 */
export function latestSave() {
  let best = null;
  for (const { slot, data } of listSaves()) {
    if (!data) continue;
    if (!best || (data.savedAt ?? 0) > (best.data.savedAt ?? 0)) best = { slot, data };
  }
  return best;
}
