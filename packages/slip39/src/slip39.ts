import { assert } from '@repo/assert';
import { getRandomBytes } from '@repo/crypto';
import type { Uint8Array_ } from '@repo/types';
import { bigIntToBytes, bytesToBigInt } from '@repo/utils';
import {
  bitsToBytes,
  SLIP39_CHECKSUM_LENGTH_WORDS,
  SLIP39_CUSTOMIZATION_STRING_EXTENDABLE,
  SLIP39_CUSTOMIZATION_STRING_ORIG,
  SLIP39_ID_EXP_LENGTH_WORDS,
  SLIP39_ITERATION_EXP_LENGTH_BITS,
  SLIP39_MAX_SHARE_COUNT,
  SLIP39_METADATA_LENGTH_WORDS,
  SLIP39_MIN_MNEMONIC_LENGTH_WORDS,
  SLIP39_MIN_STRENGTH_BITS,
  SLIP39_RADIX,
  SLIP39_RADIX_BITS,
} from './consts.js';
import { decryptMasterSecret, encryptMasterSecret } from './helpers/encryption.js';
import type { Slip39RawShare } from './helpers/gf256.js';
import { recoverSecret, splitSecret } from './helpers/secretSharing.js';
import { createChecksum, verifyChecksum } from './helpers/rs1024.js';
import type { Slip39GenerateOptions, Slip39GeneratedShare, Slip39Share } from './types.js';
import { SLIP39_ENGLISH_WORDLIST } from './wordlists/english.js';

const textEncoder = new TextEncoder();
const WORD_INDEX_BY_VALUE = new Map<string, number>(SLIP39_ENGLISH_WORDLIST.map((word, index) => [word, index]));

const assertIntegerInRange = (value: number, min: number, max: number, fieldName: string): void => {
  assert(Number.isInteger(value), `${fieldName} must be an integer`);
  assert(value >= min && value <= max, `${fieldName} must be in range ${min}..${max}`);
};

const assertPrintableAscii = (value: string, fieldName: string): void => {
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    assert(
      codePoint >= 32 && codePoint <= 126,
      `${fieldName} must contain only printable ASCII characters (code points 32-126)`,
    );
  }
};

const bitsToWords = (bitCount: number): number => {
  return Math.ceil(bitCount / SLIP39_RADIX_BITS);
};

const intToIndices = (value: bigint | number, length: number, radixBits: number): number[] => {
  const normalized = typeof value === 'bigint' ? value : BigInt(value);
  assert(normalized >= 0n, 'Value must be non-negative');

  const output = new Array<number>(length);
  const mask = (1n << BigInt(radixBits)) - 1n;
  let remaining = normalized;

  for (let i = length - 1; i >= 0; i -= 1) {
    output[i] = Number(remaining & mask);
    remaining >>= BigInt(radixBits);
  }

  assert(remaining === 0n, 'Value does not fit in the requested output length');

  return output;
};

const indicesToInt = (indices: readonly number[]): bigint => {
  let value = 0n;

  for (const index of indices) {
    assertIntegerInRange(index, 0, SLIP39_RADIX - 1, 'Word index');
    value = (value << BigInt(SLIP39_RADIX_BITS)) + BigInt(index);
  }

  return value;
};

const customizationString = (extendable: boolean): string => {
  return extendable ? SLIP39_CUSTOMIZATION_STRING_EXTENDABLE : SLIP39_CUSTOMIZATION_STRING_ORIG;
};

const encodeIdExp = (share: Slip39Share): number[] => {
  let encoded = BigInt(share.identifier);
  encoded = (encoded << 1n) + BigInt(share.extendable ? 1 : 0);
  encoded = (encoded << BigInt(SLIP39_ITERATION_EXP_LENGTH_BITS)) + BigInt(share.iterationExponent);

  return intToIndices(encoded, SLIP39_ID_EXP_LENGTH_WORDS, SLIP39_RADIX_BITS);
};

const encodeShareParams = (share: Slip39Share): number[] => {
  let encoded = share.groupIndex;
  encoded = (encoded << 4) + (share.groupThreshold - 1);
  encoded = (encoded << 4) + (share.groupCount - 1);
  encoded = (encoded << 4) + share.memberIndex;
  encoded = (encoded << 4) + (share.memberThreshold - 1);

  return intToIndices(encoded, 2, SLIP39_RADIX_BITS);
};

const parseMnemonicToIndices = (mnemonic: string): number[] => {
  const normalizedMnemonic = mnemonic.trim().toLowerCase();
  assert(normalizedMnemonic.length > 0, 'Mnemonic must not be empty');

  return normalizedMnemonic.split(/\s+/u).map((word) => {
    const index = WORD_INDEX_BY_VALUE.get(word);
    assert(index !== undefined, `Invalid mnemonic word: ${word}`);

    return index;
  });
};

const assertShareFields = (share: Slip39Share): void => {
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

const toRawShares = (shares: readonly Slip39Share[], xSelector: (share: Slip39Share) => number): Slip39RawShare[] => {
  return shares.map((share) => ({ x: xSelector(share), value: share.value }));
};

const randomIdentifier = (): number => {
  const random = getRandomBytes(2);
  return ((random[0]! << 8) | random[1]!) & 0x7fff;
};

export const encodeSlip39Mnemonic = (share: Slip39Share): string => {
  assertShareFields(share);

  const valueWordCount = bitsToWords(share.value.length * 8);
  const valueData = intToIndices(bytesToBigInt(share.value), valueWordCount, SLIP39_RADIX_BITS);

  const shareData = [...encodeIdExp(share), ...encodeShareParams(share), ...valueData];
  const checksum = createChecksum(shareData, customizationString(share.extendable));

  return [...shareData, ...checksum].map((index) => SLIP39_ENGLISH_WORDLIST[index]!).join(' ');
};

export const decodeSlip39Mnemonic = (mnemonic: string): Slip39Share => {
  const indices = parseMnemonicToIndices(mnemonic);
  assert(
    indices.length >= SLIP39_MIN_MNEMONIC_LENGTH_WORDS,
    `Invalid mnemonic length. Must be at least ${SLIP39_MIN_MNEMONIC_LENGTH_WORDS} words`,
  );

  const paddingLength = (SLIP39_RADIX_BITS * (indices.length - SLIP39_METADATA_LENGTH_WORDS)) % 16;
  assert(paddingLength <= 8, 'Invalid mnemonic length');

  const idExpInt = Number(indicesToInt(indices.slice(0, SLIP39_ID_EXP_LENGTH_WORDS)));
  const identifier = idExpInt >> 5;
  const extendable = Boolean((idExpInt >> 4) & 1);
  const iterationExponent = idExpInt & 0x0f;

  assert(verifyChecksum(indices, customizationString(extendable)), 'Invalid mnemonic checksum');

  const shareParams = intToIndices(
    Number(indicesToInt(indices.slice(SLIP39_ID_EXP_LENGTH_WORDS, SLIP39_ID_EXP_LENGTH_WORDS + 2))),
    5,
    4,
  );

  const [groupIndex, groupThresholdEncoded, groupCountEncoded, memberIndex, memberThresholdEncoded] = shareParams;
  const groupThreshold = groupThresholdEncoded! + 1;
  const groupCount = groupCountEncoded! + 1;
  const memberThreshold = memberThresholdEncoded! + 1;

  assert(groupCount >= groupThreshold, 'Group threshold cannot be greater than group count');

  const valueData = indices.slice(SLIP39_ID_EXP_LENGTH_WORDS + 2, -SLIP39_CHECKSUM_LENGTH_WORDS);
  const valueBitLength = SLIP39_RADIX_BITS * valueData.length - paddingLength;
  const valueByteLength = bitsToBytes(valueBitLength);

  let value: Uint8Array_;

  try {
    value = new Uint8Array(bigIntToBytes(indicesToInt(valueData), valueByteLength)) as Uint8Array_;
  } catch {
    throw new Error('Invalid mnemonic padding');
  }

  return {
    identifier,
    extendable,
    iterationExponent,
    groupIndex: groupIndex!,
    groupThreshold,
    groupCount,
    memberIndex: memberIndex!,
    memberThreshold,
    value,
  };
};

export const validateSlip39Mnemonic = (mnemonic: string): boolean => {
  try {
    void decodeSlip39Mnemonic(mnemonic);
    return true;
  } catch {
    return false;
  }
};

export const generateSlip39Shares = (options: Slip39GenerateOptions): Slip39GeneratedShare[] => {
  const { masterSecret, groupThreshold, groups } = options;

  assert(groups.length > 0, 'groups must contain at least one group');
  assert(groups.length <= SLIP39_MAX_SHARE_COUNT, `groups length must not exceed ${SLIP39_MAX_SHARE_COUNT}`);
  assertIntegerInRange(groupThreshold, 1, groups.length, 'groupThreshold');

  const masterSecretBitLength = masterSecret.length * 8;
  assert(
    masterSecretBitLength >= SLIP39_MIN_STRENGTH_BITS,
    `masterSecret must be at least ${SLIP39_MIN_STRENGTH_BITS} bits`,
  );
  assert(masterSecretBitLength % 16 === 0, 'masterSecret bit length must be a multiple of 16');

  for (const [groupIndex, group] of groups.entries()) {
    assertIntegerInRange(group.memberThreshold, 1, SLIP39_MAX_SHARE_COUNT, `groups[${groupIndex}].memberThreshold`);
    assertIntegerInRange(group.memberCount, 1, SLIP39_MAX_SHARE_COUNT, `groups[${groupIndex}].memberCount`);
    assert(
      group.memberThreshold <= group.memberCount,
      `groups[${groupIndex}].memberThreshold must be less than or equal to memberCount`,
    );

    if (group.memberThreshold === 1 && group.memberCount > 1) {
      throw new Error(
        `groups[${groupIndex}] is invalid: creating multiple shares with memberThreshold=1 is not allowed`,
      );
    }
  }

  const passphrase = options.passphrase ?? '';
  assertPrintableAscii(passphrase, 'passphrase');

  const iterationExponent = options.iterationExponent ?? 1;
  assertIntegerInRange(iterationExponent, 0, 0x0f, 'iterationExponent');

  const extendable = options.extendable ?? true;
  const identifier = options.identifier ?? randomIdentifier();
  assertIntegerInRange(identifier, 0, 0x7fff, 'identifier');

  const encryptedMasterSecret = encryptMasterSecret(
    masterSecret,
    textEncoder.encode(passphrase),
    iterationExponent,
    identifier,
    extendable,
  );

  const groupShares = splitSecret(groupThreshold, groups.length, encryptedMasterSecret);

  const generated: Slip39GeneratedShare[] = [];

  for (const [groupConfig, groupShare] of groups.map((group, index) => [group, groupShares[index]!] as const)) {
    const memberShares = splitSecret(groupConfig.memberThreshold, groupConfig.memberCount, groupShare.value);

    for (const memberShare of memberShares) {
      const share: Slip39Share = {
        identifier,
        extendable,
        iterationExponent,
        groupIndex: groupShare.x,
        groupThreshold,
        groupCount: groups.length,
        memberIndex: memberShare.x,
        memberThreshold: groupConfig.memberThreshold,
        value: new Uint8Array(memberShare.value) as Uint8Array_,
      };

      generated.push({
        ...share,
        mnemonic: encodeSlip39Mnemonic(share),
      });
    }
  }

  return generated;
};

export const combineSlip39Shares = (mnemonics: readonly string[], passphrase = ''): Uint8Array_ => {
  assert(mnemonics.length > 0, 'mnemonics must not be empty');
  assertPrintableAscii(passphrase, 'passphrase');

  const decodedShares = mnemonics.map((mnemonic) => decodeSlip39Mnemonic(mnemonic));
  const baseShare = decodedShares[0]!;

  for (const share of decodedShares) {
    assert(share.identifier === baseShare.identifier, 'All mnemonics must have the same identifier');
    assert(share.extendable === baseShare.extendable, 'All mnemonics must have the same extendable flag');
    assert(
      share.iterationExponent === baseShare.iterationExponent,
      'All mnemonics must have the same iteration exponent',
    );
    assert(share.groupThreshold === baseShare.groupThreshold, 'All mnemonics must have the same group threshold');
    assert(share.groupCount === baseShare.groupCount, 'All mnemonics must have the same group count');
    assert(share.value.length === baseShare.value.length, 'All mnemonics must have the same share value length');

    const valueBits = share.value.length * 8;
    assert(valueBits >= SLIP39_MIN_STRENGTH_BITS, `Share value must be at least ${SLIP39_MIN_STRENGTH_BITS} bits`);

    assert(share.groupIndex >= 0 && share.groupIndex < share.groupCount, 'groupIndex must be within groupCount bounds');
  }

  assert(
    baseShare.groupCount >= baseShare.groupThreshold,
    'groupCount must be greater than or equal to groupThreshold',
  );

  const groups = new Map<number, Slip39Share[]>();

  for (const share of decodedShares) {
    const group = groups.get(share.groupIndex) ?? [];
    group.push(share);
    groups.set(share.groupIndex, group);
  }

  assert(
    groups.size === baseShare.groupThreshold,
    `Expected ${baseShare.groupThreshold} mnemonic groups, but received ${groups.size}`,
  );

  const groupRawShares: Slip39RawShare[] = [];

  for (const [groupIndex, groupShares] of groups) {
    const memberThreshold = groupShares[0]!.memberThreshold;

    for (const share of groupShares) {
      assert(
        share.memberThreshold === memberThreshold,
        `All mnemonics in group ${groupIndex} must have the same member threshold`,
      );
    }

    const uniqueMemberIndices = new Set(groupShares.map((share) => share.memberIndex));
    assert(uniqueMemberIndices.size === groupShares.length, `Duplicate member indices detected in group ${groupIndex}`);
    assert(
      groupShares.length === memberThreshold,
      `Group ${groupIndex} requires exactly ${memberThreshold} mnemonics, but received ${groupShares.length}`,
    );

    groupRawShares.push({
      x: groupIndex,
      value: recoverSecret(
        memberThreshold,
        toRawShares(groupShares, (share) => share.memberIndex),
      ),
    });
  }

  const encryptedMasterSecret = recoverSecret(baseShare.groupThreshold, groupRawShares);

  return decryptMasterSecret(
    encryptedMasterSecret,
    textEncoder.encode(passphrase),
    baseShare.iterationExponent,
    baseShare.identifier,
    baseShare.extendable,
  ) as Uint8Array_;
};
