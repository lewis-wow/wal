import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { assert } from '@repo/assert';
import { getRandomBytes } from '@repo/crypto';
import { bytesConcat, bytesEqual } from '@repo/utils';
import {
  SLIP39_DIGEST_INDEX,
  SLIP39_DIGEST_LENGTH_BYTES,
  SLIP39_MAX_SHARE_COUNT,
  SLIP39_MIN_STRENGTH_BITS,
  SLIP39_SECRET_INDEX,
} from '../consts.js';
import { interpolate, type Slip39RawShare } from './gf256.js';

const createDigest = (randomData: Uint8Array, sharedSecret: Uint8Array): Uint8Array => {
  return hmac(sha256, randomData, sharedSecret).slice(0, SLIP39_DIGEST_LENGTH_BYTES);
};

export const splitSecret = (threshold: number, shareCount: number, sharedSecret: Uint8Array): Slip39RawShare[] => {
  assert(Number.isInteger(threshold) && threshold > 0, 'threshold must be a positive integer');
  assert(Number.isInteger(shareCount) && shareCount > 0, 'shareCount must be a positive integer');
  assert(threshold <= shareCount, 'threshold must not exceed shareCount');
  assert(shareCount <= SLIP39_MAX_SHARE_COUNT, `shareCount must not exceed ${SLIP39_MAX_SHARE_COUNT}`);

  const secretBitsLength = sharedSecret.length * 8;
  assert(secretBitsLength >= SLIP39_MIN_STRENGTH_BITS, `Secret must be at least ${SLIP39_MIN_STRENGTH_BITS} bits`);
  assert(secretBitsLength % 16 === 0, 'Secret bit length must be a multiple of 16');

  if (threshold === 1) {
    return Array.from({ length: shareCount }, (_, index) => ({
      x: index,
      value: new Uint8Array(sharedSecret),
    }));
  }

  const randomShareCount = threshold - 2;
  const shares: Slip39RawShare[] = [];

  for (let index = 0; index < randomShareCount; index += 1) {
    shares.push({ x: index, value: getRandomBytes(sharedSecret.length) });
  }

  const randomPart = getRandomBytes(sharedSecret.length - SLIP39_DIGEST_LENGTH_BYTES);
  const digest = createDigest(randomPart, sharedSecret);

  const baseShares: Slip39RawShare[] = [
    ...shares,
    { x: SLIP39_DIGEST_INDEX, value: bytesConcat(digest, randomPart) },
    { x: SLIP39_SECRET_INDEX, value: new Uint8Array(sharedSecret) },
  ];

  for (let index = randomShareCount; index < shareCount; index += 1) {
    shares.push({ x: index, value: interpolate(baseShares, index) });
  }

  return shares;
};

export const recoverSecret = (threshold: number, shares: readonly Slip39RawShare[]): Uint8Array => {
  assert(Number.isInteger(threshold) && threshold > 0, 'threshold must be a positive integer');
  assert(shares.length >= threshold, 'Not enough shares provided for the given threshold');

  if (threshold === 1) {
    return new Uint8Array(shares[0]!.value);
  }

  const sharedSecret = interpolate(shares, SLIP39_SECRET_INDEX);
  const digestShare = interpolate(shares, SLIP39_DIGEST_INDEX);
  const digest = digestShare.slice(0, SLIP39_DIGEST_LENGTH_BYTES);
  const randomPart = digestShare.slice(SLIP39_DIGEST_LENGTH_BYTES);

  assert(bytesEqual(digest, createDigest(randomPart, sharedSecret)), 'Invalid digest of the shared secret');

  return sharedSecret;
};
