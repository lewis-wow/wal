import { describe, expect, test } from 'vitest';

import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  validateMnemonic,
} from '../src/index.js';

const bytesFromHex = (hex: string): Uint8Array => {
  return new Uint8Array(Buffer.from(hex, 'hex'));
};

const hexFromBytes = (bytes: Uint8Array): string => {
  return Buffer.from(bytes).toString('hex');
};

describe('BIP39', () => {
  test('entropyToMnemonic matches known BIP39 vector', () => {
    const entropy = new Uint8Array(bytesFromHex('00000000000000000000000000000000'));

    const mnemonic = entropyToMnemonic(entropy);

    expect(mnemonic).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  test('mnemonicToEntropy round-trips known mnemonic', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const entropy = mnemonicToEntropy(mnemonic);

    expect(hexFromBytes(entropy)).toBe('00000000000000000000000000000000');
  });

  test('mnemonicToSeed matches known vector with passphrase TREZOR', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const expectedSeedHex =
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553' +
      '1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04';

    const seed = mnemonicToSeed(mnemonic, 'TREZOR');

    expect(hexFromBytes(seed)).toBe(expectedSeedHex);
  });

  test('generateMnemonic returns a valid 12-word mnemonic by default', () => {
    const mnemonic = generateMnemonic(128);

    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });
});
