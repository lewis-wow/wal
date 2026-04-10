import { assert } from '@repo/assert';

import { bytesToBigInt } from './bytesToBigInt.js';

export const ensureValidPrivateKey = (privateKey: Uint8Array, order: bigint): void => {
  assert(privateKey.length === 32, 'Private key must be 32 bytes');
  const scalar = bytesToBigInt(privateKey);
  assert(scalar > 0n && scalar < order, 'Private key must be in range 1..n-1');
};
