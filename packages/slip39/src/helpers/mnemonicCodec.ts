import { assert } from '@repo/assert';
import type { Uint8Array_ } from '@repo/types';
import { bigIntToBytes, bitsToBytes, bytesToBigInt } from '@repo/utils';

import {
  SLIP39_CHECKSUM_LENGTH_WORDS,
  SLIP39_CUSTOMIZATION_STRING_EXTENDABLE,
  SLIP39_CUSTOMIZATION_STRING_ORIG,
  SLIP39_ID_EXP_LENGTH_WORDS,
  SLIP39_ITERATION_EXP_LENGTH_BITS,
  SLIP39_METADATA_LENGTH_WORDS,
  SLIP39_MIN_MNEMONIC_LENGTH_WORDS,
  SLIP39_RADIX,
  SLIP39_RADIX_BITS,
} from '../consts.js';
import type { Slip39Share } from '../types.js';
import { SLIP39_ENGLISH_WORDLIST } from '../wordlists/english.js';
import { createChecksum, verifyChecksum } from './rs1024.js';
import { assertIntegerInRange, assertShareFields } from './shareValidation.js';

const WORD_INDEX_BY_VALUE = new Map<string, number>(SLIP39_ENGLISH_WORDLIST.map((word, index) => [word, index]));

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
