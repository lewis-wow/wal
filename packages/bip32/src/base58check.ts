import { assert } from '@repo/assert';

import { bigIntToBytes } from './helpers/bigIntToBytes.js';
import { bytesEqual } from './helpers/bytesEqual.js';
import { bytesToBigInt } from './helpers/bytesToBigInt.js';
import { doubleSha256Checksum } from './helpers/doubleSha256Checksum.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_BASE = 58n;

const BASE58_ALPHABET_INDEX = new Map<string, number>(Array.from(BASE58_ALPHABET, (char, index) => [char, index]));

export const encodeBase58 = (bytes: Uint8Array): string => {
  if (bytes.length === 0) {
    return '';
  }

  let zeroPrefixLength = 0;
  while (zeroPrefixLength < bytes.length && bytes[zeroPrefixLength] === 0) {
    zeroPrefixLength += 1;
  }

  let value = bytesToBigInt(bytes);
  let encoded = '';
  while (value > 0n) {
    const mod = Number(value % BASE58_BASE);
    value /= BASE58_BASE;
    encoded = `${BASE58_ALPHABET[mod]}${encoded}`;
  }

  return `${'1'.repeat(zeroPrefixLength)}${encoded}`;
};

export const decodeBase58 = (value: string): Uint8Array => {
  assert(value.length > 0, 'Base58 string must not be empty');

  let zeroPrefixLength = 0;
  while (zeroPrefixLength < value.length && value[zeroPrefixLength] === '1') {
    zeroPrefixLength += 1;
  }

  let decoded = 0n;
  for (const char of value) {
    const index = BASE58_ALPHABET_INDEX.get(char);
    assert(index !== undefined, `Invalid Base58 character: ${char}`);
    decoded = decoded * BASE58_BASE + BigInt(index);
  }

  const bytes = bigIntToBytes(decoded);
  const result = new Uint8Array(zeroPrefixLength + bytes.length);
  result.set(bytes, zeroPrefixLength);
  return result;
};

export const encodeBase58Check = (payload: Uint8Array): string => {
  const result = new Uint8Array(payload.length + 4);
  result.set(payload, 0);
  result.set(doubleSha256Checksum(payload), payload.length);
  return encodeBase58(result);
};

export const decodeBase58Check = (encoded: string): Uint8Array => {
  const decoded = decodeBase58(encoded);
  assert(decoded.length >= 4, 'Invalid Base58Check payload length');

  const payload = decoded.slice(0, decoded.length - 4);
  const expected = doubleSha256Checksum(payload);
  const actual = decoded.slice(decoded.length - 4);

  assert(bytesEqual(expected, actual), 'Invalid Base58Check checksum');
  return payload;
};
