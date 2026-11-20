/**
 * Tiny document store used by Demo Mode. Persists to localStorage and syncs every open tab in
 * real time via BroadcastChannel, so you can keep Owner View and Developer View open side by side.
 * Paths mirror Firestore: "workspaces/{id}/updates/{id}".
 */
const STORAGE_KEY = 'devsync:demo-db:v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('devsync-demo') : null;

let docs = load();
const listeners = new Set();

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))?.docs || null;
  } catch {
    return null;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs }));
  channel?.postMessage('changed');
  notify();
}

function notify() {
  for (const l of listeners) l();
}

channel?.addEventListener('message', () => {
  docs = load() || {};
  notify();
});

export const store = {
  isEmpty: () => !docs || Object.keys(docs).length === 0,

  reset(seedDocs) {
    docs = seedDocs;
    persist();
  },

  get(path) {
    return docs?.[path] ? { id: path.split('/').pop(), ...docs[path] } : null;
  },

  list(collectionPath) {
    const prefix = `${collectionPath}/`;
    return Object.entries(docs || {})
      .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map(([k, v]) => ({ id: k.slice(prefix.length), ...v }));
  },

  set(path, data) {
    docs = { ...docs, [path]: data };
    persist();
  },

  update(path, patchOrFn) {
    const current = docs[path];
    if (!current) throw new Error(`Document not found: ${path}`);
    const patch = typeof patchOrFn === 'function' ? patchOrFn(current) : patchOrFn;
    docs = { ...docs, [path]: { ...current, ...patch } };
    persist();
  },

  /** Calls `select()` on every change and forwards the result only when it actually changed. */
  watch(select, cb) {
    let last;
    const run = () => {
      const next = select();
      const serialized = JSON.stringify(next);
      if (serialized !== last) {
        last = serialized;
        cb(next);
      }
    };
    listeners.add(run);
    queueMicrotask(run);
    return () => listeners.delete(run);
  },
};
