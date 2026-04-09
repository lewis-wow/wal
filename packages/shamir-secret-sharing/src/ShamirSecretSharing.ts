import { p521 } from '@noble/curves/nist';
import { getRandomBytes } from '@repo/crypto';
import type { Uint8Array_ } from '@repo/types';
import { bigIntBitLength, bigIntToBytes, bytesToBigInt } from '@repo/utils';

export type ShamirShare = {
  x: bigint;
  y: bigint;
};

export type ShamirSecretSharingOptions = {
  prime?: bigint;
  randomBytes?: (length: number) => Uint8Array;
};

const Fp = p521.Point.Fp;

export class ShamirSecretSharing {
  public split(opts: { secret: Uint8Array_; threshold: number; total: number }): ShamirShare[] {
    const { secret, threshold, total } = opts;

    this.validateSplitInputs(secret, threshold, total);

    const secretBigInt = bytesToBigInt(secret);
    if (secretBigInt >= Fp.ORDER) {
      throw new Error('Secret is too large for current field prime. Use a larger prime.');
    }

    const coefficients = Array.from({ length: threshold - 1 }, () => this.randomFieldElement());

    const q = (x: bigint): bigint => {
      let acc = Fp.create(secretBigInt);
      let xPower = Fp.ONE;

      for (const coefficient of coefficients) {
        xPower = Fp.mul(xPower, x);
        acc = Fp.add(acc, Fp.mul(coefficient, xPower));
      }

      return acc;
    };

    return Array.from({ length: total }, (_, i) => {
      const x = BigInt(i + 1);
      return { x, y: q(x) };
    });
  }

  public recover(opts: { shares: ShamirShare[]; output: Uint8Array_ }): Uint8Array_ {
    const { shares, output } = opts;

    if (shares.length < 2) {
      throw new Error('At least two shares are required for recovery');
    }

    if (output.length <= 0) {
      throw new Error('output must be a non-empty Uint8Array');
    }

    this.ensureUniqueShareX(shares);

    const secret = shares.reduce((sum, shareI, i) => {
      const basis = shares.reduce((product, shareJ, j) => {
        if (i === j) {
          return product;
        }

        const numerator = Fp.neg(shareJ.x);
        const denominator = Fp.sub(shareI.x, shareJ.x);

        if (denominator === 0n) {
          throw new Error('Duplicate share x values detected');
        }

        return Fp.mul(product, Fp.mul(numerator, Fp.inv(denominator)));
      }, Fp.ONE);

      return Fp.add(sum, Fp.mul(shareI.y, basis));
    }, Fp.ZERO);

    return bigIntToBytes(secret, output);
  }

  private validateSplitInputs(secret: Uint8Array_, threshold: number, total: number): void {
    if (secret.length === 0) {
      throw new Error('Secret must not be empty');
    }

    if (!Number.isInteger(threshold) || threshold < 2) {
      throw new Error('threshold must be an integer greater than or equal to 2');
    }

    if (!Number.isInteger(total) || total < threshold) {
      throw new Error('total must be an integer greater than or equal to threshold');
    }

    if (BigInt(total) >= Fp.ORDER) {
      throw new Error('total must be less than the field prime');
    }
  }

  private ensureUniqueShareX(shares: readonly ShamirShare[]): void {
    const seen = new Set<bigint>();

    for (const { x, y } of shares) {
      if (x <= 0n || x >= Fp.ORDER) {
        throw new Error('Share x coordinates must be within finite field bounds');
      }

      if (y < 0n || y >= Fp.ORDER) {
        throw new Error('Share y coordinates must be within finite field bounds');
      }

      if (seen.has(x)) {
        throw new Error('Share x coordinates must be unique');
      }

      seen.add(x);
    }
  }

  private randomFieldElement(): bigint {
    const byteLength = Math.ceil(bigIntBitLength(Fp.ORDER) / 8);

    while (true) {
      // Normalize to a concrete Uint8Array<ArrayBuffer> for shared utils typing.
      const candidate = bytesToBigInt(getRandomBytes(byteLength));
      if (candidate < Fp.ORDER) {
        return Fp.create(candidate);
      }
    }
  }
}
