import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  normalizeFieldName,
  validateSnapshot,
} from '../netlify/functions/_shared/field-validation.mjs';

const validSnapshot = () => ({
  snapshotId: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222',
  snapshotType: 'manual',
  revision: 5,
  payload: {
    fieldName: 'West 40',
    startedAt: '2026-09-05 10:00',
    savedAt: '2026-09-05 11:00',
    currentRow: 4,
    rows: { 1: 'green', 2: 'red', 3: 'yellow' },
  },
});

test('accepts a complete manual snapshot', () => {
  const result = validateSnapshot(validSnapshot());
  assert.equal(result.rowCount, 3);
  assert.equal(result.fieldName, 'West 40');
  assert.deepEqual([...result.statusData], [0, 2, 1]);
  assert.equal(result.encodingVersion, 1);
});

test('accepts the versioned one-byte wire encoding', () => {
  const snapshot = validSnapshot();
  snapshot.payload = {
    fieldName: 'West 40',
    startedAt: '2026-09-05 10:00',
    savedAt: '2026-09-05 11:00',
    encodingVersion: 1,
    statuses: Buffer.from([0, 2, 1]).toString('base64url'),
  };
  const result = validateSnapshot(snapshot);
  assert.equal(result.rowCount, 3);
  assert.deepEqual([...result.statusData], [0, 2, 1]);
});

test('rejects unknown encoded enum values', () => {
  const snapshot = validSnapshot();
  snapshot.payload = {
    fieldName: 'West 40',
    startedAt: '',
    savedAt: '',
    encodingVersion: 1,
    statuses: Buffer.from([0, 3, 2]).toString('base64url'),
  };
  assert.throws(() => validateSnapshot(snapshot), ValidationError);
});

test('allows unnamed autosaves but requires a name for manual saves', () => {
  const autosave = validSnapshot();
  autosave.snapshotType = 'autosave';
  autosave.payload.fieldName = '';
  assert.equal(validateSnapshot(autosave).fieldName, '');

  const manual = validSnapshot();
  manual.payload.fieldName = '';
  assert.throws(() => validateSnapshot(manual), ValidationError);
});

test('rejects invalid row numbers and statuses', () => {
  const invalidStatus = validSnapshot();
  invalidStatus.payload.rows = { 1: 'done' };
  assert.throws(() => validateSnapshot(invalidStatus), ValidationError);

  const invalidRow = validSnapshot();
  invalidRow.payload.rows = { 0: 'green' };
  assert.throws(() => validateSnapshot(invalidRow), ValidationError);
});

test('normalizes field names for repeated runs', () => {
  assert.equal(normalizeFieldName('  West   40  '), 'west 40');
});

test('rejects owner fields supplied by the browser by ignoring them', () => {
  const input = { ...validSnapshot(), ownerUserId: 'someone-else' };
  const result = validateSnapshot(input);
  assert.equal('ownerUserId' in result, false);
});

test('accepts an organization ID while preserving server-owned access checks', () => {
  const input = validSnapshot();
  input.organizationId = '33333333-3333-4333-8333-333333333333';
  assert.equal(validateSnapshot(input).organizationId, input.organizationId);
});
