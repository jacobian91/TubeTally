import {
  ROW_ENCODING_VERSION,
  decodeRows,
  decodeSharePayload as decodeBinarySharePayload,
  encodeRows,
  encodeSharePayload as encodeBinarySharePayload,
} from '../netlify/functions/_shared/row-codec.mjs';

const DATABASE_NAME = 'tubetally-data';
const DATABASE_VERSION = 1;
const API_URL = '/api/fields';

let databasePromise;
let currentUser = null;
let flushPromise = null;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) {
    throw new TypeError('Invalid encoded row data.');
  }
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function compactSnapshot(snapshot) {
  const payload = snapshot?.payload || {};
  if (payload.encodingVersion === ROW_ENCODING_VERSION && typeof payload.statuses === 'string') {
    return structuredClone(snapshot);
  }
  const statuses = bytesToBase64Url(encodeRows(payload.rows || {}, payload.currentRow));
  return {
    ...structuredClone(snapshot),
    payload: {
      fieldName: payload.fieldName || '',
      startedAt: payload.startedAt || '',
      savedAt: payload.savedAt || '',
      encodingVersion: ROW_ENCODING_VERSION,
      statuses,
    },
  };
}

function inflateRemoteField(field) {
  if (field?.rows || field?.encodingVersion !== ROW_ENCODING_VERSION || typeof field?.statuses !== 'string') {
    return field;
  }
  const statusBytes = base64UrlToBytes(field.statuses);
  const { statuses: _statuses, encodingVersion: _encodingVersion, ...metadata } = field;
  return {
    ...metadata,
    rows: decodeRows(statusBytes),
    currentRow: statusBytes.length + 1,
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('localFields')) {
        db.createObjectStore('localFields', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queue = db.createObjectStore('syncQueue', { keyPath: 'queueId' });
        queue.createIndex('userId', 'userId');
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('activeDrafts')) {
        db.createObjectStore('activeDrafts', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function put(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(structuredClone(value));
  await transactionDone(transaction);
}

async function remove(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

async function all(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestResult(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return result;
}

async function getMetadata(key) {
  const db = await openDatabase();
  const transaction = db.transaction('metadata', 'readonly');
  const result = await requestResult(transaction.objectStore('metadata').get(key));
  await transactionDone(transaction);
  return result?.value;
}

async function setMetadata(key, value) {
  await put('metadata', { key, value });
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setSyncState(state, pending = 0) {
  emit('tubetally:sync-state', { state, pending });
}

async function pendingForCurrentUser() {
  if (!currentUser?.id) return [];
  const items = await all('syncQueue');
  return items
    .filter(item => item.userId === currentUser.id)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

async function sendQueueItem(item) {
  const request = item.operation === 'delete'
    ? { method: 'DELETE' }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compactSnapshot(item.snapshot)),
      };
  const scopeQuery = item.organizationId
    ? `?organizationId=${encodeURIComponent(item.organizationId)}`
    : '';
  const url = item.operation === 'delete' ? `${API_URL}/${item.runId}${scopeQuery}` : API_URL;
  const response = await fetch(url, { ...request, credentials: 'same-origin' });
  if (!response.ok && !(item.operation === 'delete' && response.status === 404)) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Sync failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
}

async function flushQueue() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (!currentUser?.id) {
      setSyncState('local');
      return;
    }
    if (!navigator.onLine) {
      const pending = await pendingForCurrentUser();
      setSyncState('offline', pending.length);
      return;
    }

    const pending = await pendingForCurrentUser();
    if (!pending.length) {
      setSyncState('synced');
      return;
    }
    setSyncState('syncing', pending.length);

    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      try {
        await sendQueueItem(item);
        await remove('syncQueue', item.queueId);
        if (item.operation === 'snapshot') {
          emit('tubetally:snapshot-synced', {
            userId: item.userId,
            localFieldId: item.localFieldId,
            runId: item.snapshot.runId,
            snapshotType: item.snapshot.snapshotType,
          });
        }
      } catch (error) {
        console.warn('TubeTally sync paused', error);
        setSyncState(error.status === 401 ? 'signin' : 'error', pending.length - index);
        return;
      }
    }

    setSyncState('synced');
    await refreshRemoteFields();
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

async function queueSnapshot(snapshot, localFieldId = null) {
  if (!currentUser?.id) return false;
  await put('syncQueue', {
    queueId: `snapshot:${currentUser.id}:${snapshot.snapshotId}`,
    operation: 'snapshot',
    userId: currentUser.id,
    organizationId: snapshot.organizationId || null,
    localFieldId,
    snapshot: compactSnapshot(snapshot),
    queuedAt: new Date().toISOString(),
  });
  setSyncState(navigator.onLine ? 'syncing' : 'offline', 1);
  if (flushPromise) await flushPromise;
  void flushQueue();
  return true;
}

async function queueDelete(runId, organizationId = null) {
  if (!currentUser?.id || !runId) return false;
  const queueId = `delete:${currentUser.id}:${organizationId || 'personal'}:${runId}`;
  await put('syncQueue', {
    queueId,
    operation: 'delete',
    userId: currentUser.id,
    runId,
    organizationId,
    queuedAt: new Date().toISOString(),
  });
  setSyncState(navigator.onLine ? 'syncing' : 'offline', 1);
  if (flushPromise) await flushPromise;
  void flushQueue();
  return true;
}

async function refreshRemoteFields(organizationId = null) {
  if (!currentUser?.id || !navigator.onLine) return;
  try {
    const scopeQuery = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const response = await fetch(`${API_URL}${scopeQuery}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Unable to load account fields (${response.status})`);
    const body = await response.json();
    emit('tubetally:remote-fields', {
      fields: (body.fields || []).map(inflateRemoteField),
      organizationId,
    });
  } catch (error) {
    console.warn('Unable to refresh account fields', error);
  }
}

async function setUser(user) {
  currentUser = user?.id ? { id: user.id } : null;
  if (!currentUser) {
    setSyncState('local');
    return;
  }
  const cachedFields = (await all('localFields'))
    .filter(field => field.accountUserId === currentUser.id);
  if (cachedFields.length) emit('tubetally:remote-fields', { fields: cachedFields, cached: true });
  await flushQueue();
  await refreshRemoteFields();
}

function fieldIdentity(field) {
  return field?.runId || field?.id;
}

function isNewerField(candidate, current) {
  const candidateRevision = Number.isSafeInteger(candidate?.revision) ? candidate.revision : 0;
  const currentRevision = Number.isSafeInteger(current?.revision) ? current.revision : 0;
  if (candidateRevision !== currentRevision) return candidateRevision > currentRevision;
  return String(candidate?.serverSavedAt || candidate?.savedAt || '')
    > String(current?.serverSavedAt || current?.savedAt || '');
}

async function dedupeStoredFields(fields) {
  const byRun = new Map();
  const duplicateIds = new Set();
  for (const field of fields) {
    const identity = fieldIdentity(field);
    if (!identity) continue;
    const current = byRun.get(identity);
    if (!current) {
      byRun.set(identity, field);
      continue;
    }
    if (isNewerField(field, current)) {
      duplicateIds.add(current.id);
      byRun.set(identity, field);
    } else {
      duplicateIds.add(field.id);
    }
  }
  for (const id of duplicateIds) await remove('localFields', id);
  return [...byRun.values()];
}

async function initialize(cachedFields = []) {
  await openDatabase();
  for (const field of cachedFields) await put('localFields', field);
  const fields = await dedupeStoredFields(
    (await all('localFields')).filter(field => !field.accountUserId)
  );
  if (window.tubeTallyUser) void setUser(window.tubeTallyUser);
  else setSyncState('local');
  return fields;
}

async function saveLocalField(field) {
  await put('localFields', field);
}

async function deleteLocalField(id) {
  await remove('localFields', id);
}

async function saveActiveDraft(state) {
  await put('activeDrafts', { key: 'device-active', state });
}

async function clearDeviceData() {
  if (databasePromise) {
    const db = await databasePromise;
    db.close();
  }
  databasePromise = null;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = resolve;
  });
}

window.addEventListener('tubetally:auth-change', event => {
  void setUser(event.detail?.user || null);
});
window.addEventListener('online', () => void flushQueue());
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void flushQueue();
});

window.tubeTallyData = {
  initialize,
  saveLocalField,
  deleteLocalField,
  saveActiveDraft,
  clearDeviceData,
  queueSnapshot,
  queueDelete,
  refreshRemoteFields,
  flushQueue,
  getMetadata,
  setMetadata,
  encodeSharePayload(data) {
    return bytesToBase64Url(encodeBinarySharePayload(data));
  },
  decodeSharePayload(encoded) {
    return decodeBinarySharePayload(base64UrlToBytes(encoded));
  },
};
