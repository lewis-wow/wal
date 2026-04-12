import { assert } from '@repo/assert';

import { SLIP39_MAX_SHARE_COUNT, SLIP39_MIN_STRENGTH_BITS } from '../consts.js';
import type { Slip39Share } from '../types.js';
import type { Slip39RawShare } from './gf256.js';

export const assertIntegerInRange = (value: number, min: number, max: number, fieldName: string): void => {
  assert(Number.isInteger(value), `${fieldName} must be an integer`);
  assert(value >= min && value <= max, `${fieldName} must be in range ${min}..${max}`);
};

export const assertPrintableAscii = (value: string, fieldName: string): void => {
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    assert(
      codePoint >= 32 && codePoint <= 126,
      `${fieldName} must contain only printable ASCII characters (code points 32-126)`,
    );
  }
};

export const assertShareFields = (share: Slip39Share): void => {
  assertIntegerInRange(share.identifier, 0, 0x7fff, 'identifier');
  assertIntegerInRange(share.iterationExponent, 0, 0x0f, 'iterationExponent');
  assertIntegerInRange(share.groupIndex, 0, 0x0f, 'groupIndex');
  assertIntegerInRange(share.groupThreshold, 1, SLIP39_MAX_SHARE_COUNT, 'groupThreshold');
  assertIntegerInRange(share.groupCount, 1, SLIP39_MAX_SHARE_COUNT, 'groupCount');
  assert(share.groupThreshold <= share.groupCount, 'groupThreshold must be less than or equal to groupCount');
  assertIntegerInRange(share.memberIndex, 0, 0x0f, 'memberIndex');
  assertIntegerInRange(share.memberThreshold, 1, SLIP39_MAX_SHARE_COUNT, 'memberThreshold');

  const valueBits = share.value.length * 8;
  assert(valueBits >= SLIP39_MIN_STRENGTH_BITS, `Share value must be at least ${SLIP39_MIN_STRENGTH_BITS} bits`);
  assert(valueBits % 16 === 0, 'Share value bit length must be a multiple of 16');
};

export const toRawShares = (
  shares: readonly Slip39Share[],
  xSelector: (share: Slip39Share) => number,
): Slip39RawShare[] => {
  return shares.map((share) => ({ x: xSelector(share), value: share.value }));
};
