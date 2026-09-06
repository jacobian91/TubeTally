import {
  ROW_ENCODING_VERSION,
  countEncodedRows,
  encodeRows,
} from './row-codec.mjs';
import { Buffer } from 'node:buffer';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['green', 'red', 'yellow']);

export class ValidationError extends Error {}

function requiredUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function shortText(value, label, maxLength, { required = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text.`);
  const result = value.trim();
  if (required && !result) throw new ValidationError(`${label} is required.`);
  if (result.length > maxLength) throw new ValidationError(`${label} is too long.`);
  return result;
}

export function normalizeFieldName(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function validateSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('A snapshot is required.');
  }

  const snapshotId = requiredUuid(input.snapshotId, 'snapshotId');
  const runId = requiredUuid(input.runId, 'runId');
  const snapshotType = input.snapshotType;
  if (!['autosave', 'manual'].includes(snapshotType)) {
    throw new ValidationError('snapshotType must be autosave or manual.');
  }

  const revision = Number(input.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ValidationError('revision must be a non-negative integer.');
  }

  const payload = input.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('payload must be an object.');
  }

  const fieldName = shortText(payload.fieldName, 'fieldName', 200, {
    required: snapshotType === 'manual',
  });
  const startedAt = shortText(payload.startedAt, 'startedAt', 100);
  const savedAt = shortText(payload.savedAt, 'savedAt', 100);
  let statusData;
  let rowCount;
  if (payload.encodingVersion === ROW_ENCODING_VERSION && typeof payload.statuses === 'string') {
    if (!/^[A-Za-z0-9_-]*$/.test(payload.statuses) || payload.statuses.length % 4 === 1) {
      throw new ValidationError('statuses must be valid base64url data.');
    }
    statusData = Buffer.from(payload.statuses, 'base64url');
    try {
      rowCount = countEncodedRows(statusData);
    } catch {
      throw new ValidationError('statuses contains an unknown enum value.');
    }
  } else {
    const rows = payload.rows;
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) {
      throw new ValidationError('rows must be an object or versioned encoded statuses.');
    }

    const cleanRows = {};
    for (const [rowNumber, status] of Object.entries(rows)) {
      if (!/^[1-9]\d*$/.test(rowNumber) || !STATUSES.has(status)) {
        throw new ValidationError('Each row must have a positive number and a valid status.');
      }
      cleanRows[rowNumber] = status;
    }

    const currentRow = Number(payload.currentRow);
    if (!Number.isSafeInteger(currentRow) || currentRow < 1) {
      throw new ValidationError('currentRow must be a positive integer.');
    }
    statusData = Buffer.from(encodeRows(cleanRows, currentRow));
    rowCount = Object.keys(cleanRows).length;
  }

  return {
    snapshotId,
    runId,
    snapshotType,
    revision,
    fieldName,
    normalizedFieldName: fieldName ? normalizeFieldName(fieldName) : '',
    startedAt,
    savedAt,
    rowCount,
    encodingVersion: ROW_ENCODING_VERSION,
    statusData,
  };
}

export function validateRunId(value) {
  return requiredUuid(value, 'runId');
}
