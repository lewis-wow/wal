import { bytesToBigInt } from './bytesToBigInt.js';

export const ensureValidPrivateKey = (privateKey: Uint8Array, order: bigint): void => {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  const scalar = bytesToBigInt(privateKey);
  if (!(scalar > 0n && scalar < order)) {
    throw new Error('Private key must be in range 1..n-1');
  }
};
