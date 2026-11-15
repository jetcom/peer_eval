// Text a student has typed for an evaluation that is not rated yet, and so
// not saved to the server, is kept in this browser so it survives leaving the
// page. Scores are never drafted: only a rated evaluation reaches the server.

const storageKey = (scope) => `evalDraft:${scope}`;

export function loadDrafts(scope) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(scope))) || {};
  } catch (err) {
    return {};
  }
}

export function storeDrafts(scope, drafts) {
  try {
    if (Object.keys(drafts).length > 0) {
      localStorage.setItem(storageKey(scope), JSON.stringify(drafts));
    } else {
      localStorage.removeItem(storageKey(scope));
    }
  } catch (err) {
    // Storage unavailable (private window, quota): drafts are best-effort
  }
}
