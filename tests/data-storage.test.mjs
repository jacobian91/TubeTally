import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';

let dataApi;

test('queues authenticated snapshots and retries them after reconnecting', async () => {
  const testWindow = new EventTarget();
  globalThis.window = testWindow;
  globalThis.indexedDB = indexedDB;
  globalThis.document = { visibilityState: 'visible' };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true },
  });

  const posts = [];
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method || 'GET') === 'POST') {
      posts.push(JSON.parse(options.body));
      return Response.json({ ok: true }, { status: 201 });
    }
    return Response.json({ fields: [] });
  };

  await import(`../src/data-storage.js?test=${Date.now()}`);
  dataApi = window.tubeTallyData;
  await window.tubeTallyData.initialize([]);
  window.dispatchEvent(new CustomEvent('tubetally:auth-change', {
    detail: { user: { id: 'identity-user-1' } },
  }));

  const snapshot = {
    snapshotId: '11111111-1111-4111-8111-111111111111',
    runId: '22222222-2222-4222-8222-222222222222',
    snapshotType: 'autosave',
    revision: 50,
    payload: {
      fieldName: 'West 40',
      startedAt: '2026-09-05 10:00',
      savedAt: '',
      rows: { 1: 'green' },
      currentRow: 2,
    },
  };

  await window.tubeTallyData.queueSnapshot(snapshot);
  await window.tubeTallyData.flushQueue();
  assert.equal(posts.length, 1);
  assert.equal('ownerUserId' in posts[0], false);

  navigator.onLine = false;
  await window.tubeTallyData.queueSnapshot({
    ...snapshot,
    snapshotId: '33333333-3333-4333-8333-333333333333',
    revision: 100,
  });
  await window.tubeTallyData.flushQueue();
  assert.equal(posts.length, 1);

  navigator.onLine = true;
  window.dispatchEvent(new Event('online'));
  await new Promise(resolve => setTimeout(resolve, 10));
  await window.tubeTallyData.flushQueue();
  assert.equal(posts.length, 2);
  await window.tubeTallyData.clearDeviceData();
});

test('deduplicates compatibility-cache records for the same field run', async () => {
  const runId = '44444444-4444-4444-8444-444444444444';
  const older = {
    id: 'legacy-cache-id', runId, fieldName: 'West 40', revision: 1,
    savedAt: '2026-09-05 10:00', rows: { 1: 'green' },
  };
  const newer = {
    id: runId, runId, fieldName: 'West 40', revision: 2,
    savedAt: '2026-09-05 10:05', rows: { 1: 'green', 2: 'green' },
  };
  await dataApi.saveLocalField(older);
  await dataApi.saveLocalField(newer);

  const fields = await dataApi.initialize([older]);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].id, runId);
  assert.equal(fields[0].revision, 2);
  await dataApi.clearDeviceData();
});
