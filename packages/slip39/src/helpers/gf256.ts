import { assert } from '@repo/assert';
import { gf256Div, gf256Mul } from '@repo/gf256';

export type Slip39RawShare = {
  x: number;
  value: Uint8Array;
};

export const interpolate = (shares: Slip39RawShare[], x: number): Uint8Array => {
  assert(shares.length > 0, 'At least one share is required');
  assert(Number.isInteger(x) && x >= 0 && x <= 255, 'Interpolation index must be in range 0..255');

  const uniqueX = new Set<number>();
  const expectedLength = shares[0]!.value.length;

  for (const share of shares) {
    assert(Number.isInteger(share.x) && share.x >= 0 && share.x <= 255, 'Share index must be in range 0..255');
    assert(share.value.length === expectedLength, 'All share values must have the same length');
    assert(!uniqueX.has(share.x), 'Share indices must be unique');

    uniqueX.add(share.x);

    if (share.x === x) {
      return new Uint8Array(share.value);
    }
  }

  const result = new Uint8Array(expectedLength);

  for (let i = 0; i < shares.length; i += 1) {
    const shareI = shares[i]!;
    let basis = 1;

    for (let j = 0; j < shares.length; j += 1) {
      if (i === j) {
        continue;
      }

      const shareJ = shares[j]!;
      const numerator = x ^ shareJ.x;
      const denominator = shareI.x ^ shareJ.x;

      basis = gf256Mul(basis, gf256Div(numerator, denominator));
    }

    for (let k = 0; k < result.length; k += 1) {
      const current = result[k] ?? 0;
      result[k] = current ^ gf256Mul(shareI.value[k]!, basis);
    }
  }

  return result;
};
