import { describe, expect, test } from 'vitest';
import { bytesToHex, hexToBytes } from '@repo/utils';

import {
  combineSlip39Shares,
  decodeSlip39Mnemonic,
  encodeSlip39Mnemonic,
  generateSlip39Shares,
  validateSlip39Mnemonic,
} from '../src/index.js';

const PASS = 'TREZOR';

const validVectors = [
  {
    description: 'valid mnemonic without sharing (128 bits)',
    mnemonics: [
      'duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision keyboard',
    ],
    secretHex: 'bb54aac4b89dc868ba37d9cc21b2cece',
  },
  {
    description: 'basic sharing 2-of-3 (128 bits)',
    mnemonics: [
      'shadow pistol academic always adequate wildlife fancy gross oasis cylinder mustang wrist rescue view short owner flip making coding armed',
      'shadow pistol academic acid actress prayer class unknown daughter sweater depict flip twice unkind craft early superior advocate guest smoking',
    ],
    secretHex: 'b43ceb7e57a0ea8766221624d01b0864',
  },
  {
    description: 'threshold number of groups and members in each group (128 bits)',
    mnemonics: [
      'eraser senior decision roster beard treat identify grumpy salt index fake aviation theater cubic bike cause research dragon emphasis counter',
      'eraser senior ceramic snake clay various huge numb argue hesitate auction category timber browser greatest hanger petition script leaf pickup',
      'eraser senior ceramic shaft dynamic become junior wrist silver peasant force math alto coal amazing segment yelp velvet image paces',
      'eraser senior ceramic round column hawk trust auction smug shame alive greatest sheriff living perfect corner chest sled fumes adequate',
      'eraser senior decision smug corner ruin rescue cubic angel tackle skin skunk program roster trash rumor slush angel flea amazing',
    ],
    secretHex: '7c3397a292a5941682d7a4ae2d898d11',
  },
  {
    description: 'valid extendable mnemonic without sharing (128 bits)',
    mnemonics: [
      'testify swimming academic academic column loyalty smear include exotic bedroom exotic wrist lobe cover grief golden smart junior estimate learn',
    ],
    secretHex: '1679b4516e0ee5954351d288a838f45e',
  },
] as const;

const invalidVectors = [
  {
    description: 'mnemonic with invalid checksum (128 bits)',
    mnemonics: [
      'duckling enlarge academic academic agency result length solution fridge kidney coal piece deal husband erode duke ajar critical decision kidney',
    ],
  },
  {
    description: 'mnemonic with invalid padding (128 bits)',
    mnemonics: [
      'duckling enlarge academic academic email result length solution fridge kidney coal piece deal husband erode duke ajar music cargo fitness',
    ],
  },
  {
    description: 'mnemonics with different identifiers (128 bits)',
    mnemonics: [
      'adequate smoking academic acid debut wine petition glen cluster slow rhyme slow simple epidemic rumor junk tracks treat olympic tolerate',
      'adequate stay academic agency agency formal party ting frequent learn upstairs remember smear leaf damage anatomy ladle market hush corner',
    ],
  },
] as const;

describe('SLIP39', () => {
  test('decode/encode round-trips a canonical mnemonic', () => {
    const mnemonic = validVectors[0]!.mnemonics[0]!;

    const decoded = decodeSlip39Mnemonic(mnemonic);
    const reEncoded = encodeSlip39Mnemonic(decoded);

    expect(reEncoded).toBe(mnemonic);
    expect(validateSlip39Mnemonic(mnemonic)).toBe(true);
  });

  test.each(validVectors)('combines official vector: $description', ({ mnemonics, secretHex }) => {
    const recovered = combineSlip39Shares(mnemonics, PASS);

    expect(bytesToHex(recovered)).toBe(secretHex);
  });

  test.each(invalidVectors)('rejects invalid vector: $description', ({ mnemonics }) => {
    expect(() => combineSlip39Shares(mnemonics, PASS)).toThrow();
  });

  test('generate + combine round-trips with basic single-group sharing', () => {
    const masterSecret = hexToBytes('00112233445566778899aabbccddeeff');

    const shares = generateSlip39Shares({
      masterSecret,
      passphrase: 'wallet',
      groupThreshold: 1,
      groups: [{ memberThreshold: 2, memberCount: 3 }],
      iterationExponent: 1,
      extendable: true,
    });

    const selected = shares.slice(0, 2).map((share) => share.mnemonic);
    const recovered = combineSlip39Shares(selected, 'wallet');

    expect(bytesToHex(recovered)).toBe(bytesToHex(masterSecret));
    expect(shares.every((share) => validateSlip39Mnemonic(share.mnemonic))).toBe(true);
  });

  test('generate + combine round-trips with two-level grouped sharing', () => {
    const masterSecret = hexToBytes('ffeeddccbbaa99887766554433221100');

    const shares = generateSlip39Shares({
      masterSecret,
      passphrase: 'group-pass',
      groupThreshold: 2,
      groups: [
        { memberThreshold: 2, memberCount: 3 },
        { memberThreshold: 1, memberCount: 1 },
        { memberThreshold: 2, memberCount: 2 },
      ],
      iterationExponent: 0,
      extendable: true,
    });

    const group0 = shares.filter((share) => share.groupIndex === 0).slice(0, 2);
    const group2 = shares.filter((share) => share.groupIndex === 2).slice(0, 2);

    const recovered = combineSlip39Shares(
      [...group0.map((share) => share.mnemonic), ...group2.map((share) => share.mnemonic)],
      'group-pass',
    );

    expect(bytesToHex(recovered)).toBe(bytesToHex(masterSecret));
  });
});
