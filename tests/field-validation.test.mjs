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
  assert.deepEqual(result.payload.rows, { 1: 'green', 2: 'red', 3: 'yellow' });
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
