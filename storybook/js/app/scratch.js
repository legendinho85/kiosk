// Recordings that aren't kept yet: a take of the child's name the parent
// hasn't said "Done" to. They live in memory only (never written to the
// device), so going Back — or closing the page — leaves nothing behind, and
// "Record again" never replaces a saved recording until the parent chooses
// it. The narrator looks here before the device's store (js/main.js), so
// "Hear it in the story" can play a take before it is kept.

const takes = new Map();

export const scratch = {
  /** @param {string} id @param {Blob} blob */
  put(id, blob) {
    if (id && blob) takes.set(id, blob);
  },
  /** @returns {Blob|null} */
  get(id) {
    return takes.get(id) ?? null;
  },
  has(id) {
    return takes.has(id);
  },
  delete(id) {
    takes.delete(id);
  },
  /** "Forget everything": drop every take. */
  clear() {
    takes.clear();
  },
};
