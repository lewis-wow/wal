import type { Uint8Array_ } from '@repo/types';

export const bytesToBigInt = (input: Uint8Array_): bigint => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let result = 0n;

  for (const byte of bytes) {
    result = (result << 8n) + BigInt(byte);
  }

  return result;
};
