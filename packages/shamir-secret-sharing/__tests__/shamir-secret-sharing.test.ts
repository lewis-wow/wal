import { describe, expect, test } from 'vitest';

import { ShamirSecretSharing } from '../src/index.js';

describe('ShamirSecretSharing', () => {
  test('split returns requested number of shares with sequential x values', () => {
    const shamir = new ShamirSecretSharing();
    const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const shares = shamir.split({ secret, threshold: 3, total: 5 });

    expect(shares).toHaveLength(5);
    expect(shares.map((share) => share.x)).toEqual([1n, 2n, 3n, 4n, 5n]);
  });

  test('recover reconstructs secret into provided output buffer', () => {
    const shamir = new ShamirSecretSharing();
    const secret = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);

    const shares = shamir.split({ secret, threshold: 3, total: 5 });
    const output = new Uint8Array(secret.length);

    const recovered = shamir.recover({ shares: shares.slice(0, 3), output });

    expect(recovered).toBe(output);
    expect(recovered).toEqual(secret);
  });

  test('split throws on invalid threshold', () => {
    const shamir = new ShamirSecretSharing();
    const secret = new Uint8Array([1, 2, 3]);

    expect(() => shamir.split({ secret, threshold: 1, total: 3 })).toThrow(
      'threshold must be an integer greater than or equal to 2',
    );
  });

  test('recover throws when output buffer is empty', () => {
    const shamir = new ShamirSecretSharing();
    const secret = new Uint8Array([1, 2, 3, 4]);
    const shares = shamir.split({ secret, threshold: 2, total: 3 });

    expect(() => shamir.recover({ shares: shares.slice(0, 2), output: new Uint8Array(0) })).toThrow(
      'output must be a non-empty Uint8Array',
    );
  });
});
