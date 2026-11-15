import axios from 'axios';

// Text a student has typed for an evaluation that is not complete yet is kept
// as a draft: on the server so it follows them between devices, and in this
// browser so it survives a failed request. Scores are never drafted, and a
// draft is never a submission.

const storageKey = (userId, scope) => `evalDraft:${userId}:${scope}`;
const lastSent = {};   // storage key -> JSON last known to be on the server
const timers = {};     // storage key -> pending sync timer

function readLocal(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && typeof stored.drafts === 'object') return stored;
  } catch (err) {
    // unreadable or unavailable: treat as no local draft
  }
  return { at: 0, drafts: {} };
}

function writeLocal(key, drafts) {
  try {
    if (Object.keys(drafts).length > 0) {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), drafts }));
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    // storage unavailable (private window, quota): the server copy still works
  }
}

// The newer of the server's and this browser's copy
export async function loadDrafts(userId, scope) {
  const key = storageKey(userId, scope);
  const local = readLocal(key);
  try {
    const res = await axios.get('/api/evaluations/drafts', { params: { scope } });
    const serverDrafts = res.data.drafts || {};
    const serverAt = res.data.updated_at ? new Date(res.data.updated_at).getTime() : 0;
    lastSent[key] = JSON.stringify(serverDrafts);
    return local.at > serverAt ? local.drafts : serverDrafts;
  } catch (err) {
    return local.drafts;
  }
}

export function storeDrafts(userId, scope, drafts) {
  const key = storageKey(userId, scope);
  const json = JSON.stringify(drafts);
  if (json !== JSON.stringify(readLocal(key).drafts)) writeLocal(key, drafts);

  clearTimeout(timers[key]);
  if (json === lastSent[key]) return;
  timers[key] = setTimeout(() => {
    axios.put('/api/evaluations/drafts', { scope, drafts })
      .then(() => { lastSent[key] = json; })
      .catch(() => { /* kept locally; retried on the next change */ });
  }, 1500);
}
