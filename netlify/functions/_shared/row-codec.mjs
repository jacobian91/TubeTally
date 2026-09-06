export const ROW_ENCODING_VERSION = 1;
export const EMPTY_ROW = 255;

const STATUS_TO_BYTE = Object.freeze({
  green: 0,
  yellow: 1,
  red: 2,
});

const BYTE_TO_STATUS = Object.freeze(['green', 'yellow', 'red']);

export function encodeRows(rows = {}, currentRow) {
  const entries = Object.entries(rows);
  const highestRecordedRow = entries.reduce((highest, [rowNumber]) => {
    const parsed = Number(rowNumber);
    return Number.isSafeInteger(parsed) && parsed > highest ? parsed : highest;
  }, 0);
  const encodedLength = Math.max(
    highestRecordedRow,
    Number.isSafeInteger(currentRow) ? currentRow - 1 : 0,
  );
  const encoded = new Uint8Array(encodedLength);
  encoded.fill(EMPTY_ROW);

  for (const [rowNumber, status] of entries) {
    const parsed = Number(rowNumber);
    const value = STATUS_TO_BYTE[status];
    if (!Number.isSafeInteger(parsed) || parsed < 1 || value === undefined) {
      throw new TypeError('Rows must have positive integer keys and valid statuses.');
    }
    encoded[parsed - 1] = value;
  }
  return encoded;
}

export function decodeRows(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  const rows = {};
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (value === EMPTY_ROW) continue;
    const status = BYTE_TO_STATUS[value];
    if (!status) throw new TypeError(`Unknown row status byte: ${value}`);
    rows[index + 1] = status;
  }
  return rows;
}

export function countEncodedRows(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  let count = 0;
  for (const value of bytes) {
    if (value === EMPTY_ROW) continue;
    if (!BYTE_TO_STATUS[value]) throw new TypeError(`Unknown row status byte: ${value}`);
    count += 1;
  }
  return count;
}

export function encodeSharePayload({ fieldName = '', startedAt = '', rows = {}, currentRow }) {
  const textEncoder = new TextEncoder();
  const nameBytes = textEncoder.encode(fieldName);
  const dateBytes = textEncoder.encode(startedAt);
  if (nameBytes.length > 65535 || dateBytes.length > 65535) {
    throw new TypeError('Share metadata is too large.');
  }
  const statusBytes = encodeRows(rows, currentRow);
  const result = new Uint8Array(5 + nameBytes.length + dateBytes.length + statusBytes.length);
  const view = new DataView(result.buffer);
  result[0] = ROW_ENCODING_VERSION;
  view.setUint16(1, nameBytes.length);
  view.setUint16(3, dateBytes.length);
  result.set(nameBytes, 5);
  result.set(dateBytes, 5 + nameBytes.length);
  result.set(statusBytes, 5 + nameBytes.length + dateBytes.length);
  return result;
}

export function decodeSharePayload(encoded) {
  const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  if (bytes.length < 5 || bytes[0] !== ROW_ENCODING_VERSION) {
    throw new TypeError('Unsupported share data version.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(1);
  const dateLength = view.getUint16(3);
  const statusOffset = 5 + nameLength + dateLength;
  if (statusOffset > bytes.length) throw new TypeError('Invalid share data.');
  const textDecoder = new TextDecoder();
  const fieldName = textDecoder.decode(bytes.subarray(5, 5 + nameLength));
  const startedAt = textDecoder.decode(bytes.subarray(5 + nameLength, statusOffset));
  const statusBytes = bytes.subarray(statusOffset);
  return {
    fieldName,
    startedAt,
    rows: decodeRows(statusBytes),
    currentRow: statusBytes.length + 1,
  };
}
