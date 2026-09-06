import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_ROW,
  decodeRows,
  decodeSharePayload,
  encodeRows,
  encodeSharePayload,
} from '../netlify/functions/_shared/row-codec.mjs';

test('encodes one enum byte per row and preserves gaps', () => {
  const encoded = encodeRows({ 1: 'green', 2: 'yellow', 4: 'red' }, 5);
  assert.deepEqual([...encoded], [0, 1, EMPTY_ROW, 2]);
  assert.deepEqual(decodeRows(encoded), { 1: 'green', 2: 'yellow', 4: 'red' });
});

test('uses exactly one status byte per row', () => {
  const rows = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [index + 1, 'green']));
  assert.equal(encodeRows(rows, 1001).byteLength, 1000);
});

test('round trips versioned share data including unicode field names', () => {
  const source = {
    fieldName: 'North ☂ Field',
    startedAt: '2026-09-06 09:30',
    rows: { 1: 'green', 2: 'red', 3: 'yellow' },
    currentRow: 4,
  };
  assert.deepEqual(decodeSharePayload(encodeSharePayload(source)), source);
});
