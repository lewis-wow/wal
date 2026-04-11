import { assert } from '@repo/assert';

export const splitHmac512 = (value: Uint8Array): [Uint8Array, Uint8Array] => {
  assert(value.length === 64, 'HMAC-SHA512 output must be 64 bytes');
  return [value.slice(0, 32), value.slice(32)];
};
