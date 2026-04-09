import type { Uint8Array_ } from '@repo/types';

export const getRandomBytes = (len: number): Uint8Array_ => {
  if (!Number.isInteger(len) || len <= 0) {
    throw new Error('len must be a positive integer');
  }

  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure RNG is unavailable in this environment');
  }

  const random = globalThis.crypto.getRandomValues(new Uint8Array(len));
  return new Uint8Array(random);
};
