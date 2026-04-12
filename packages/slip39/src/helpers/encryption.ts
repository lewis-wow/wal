import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { assert } from '@repo/assert';
import { bytesConcat } from '@repo/utils';
import {
  bitsToBytes,
  SLIP39_BASE_ITERATION_COUNT,
  SLIP39_CUSTOMIZATION_STRING_ORIG,
  SLIP39_ID_LENGTH_BITS,
  SLIP39_ROUND_COUNT,
} from '../consts.js';

const textEncoder = new TextEncoder();

const xorBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  assert(left.length === right.length, 'Byte arrays must have matching lengths for XOR');

  const output = new Uint8Array(left.length);
  for (let i = 0; i < output.length; i += 1) {
    output[i] = left[i]! ^ right[i]!;
  }

  return output;
};

const getSalt = (identifier: number, extendable: boolean): Uint8Array => {
  if (extendable) {
    return new Uint8Array(0);
  }

  const identifierLength = bitsToBytes(SLIP39_ID_LENGTH_BITS);
  const identifierBytes = new Uint8Array(identifierLength);

  for (let i = identifierLength - 1; i >= 0; i -= 1) {
    identifierBytes[i] = (identifier >> (8 * (identifierLength - 1 - i))) & 0xff;
  }

  return bytesConcat(textEncoder.encode(SLIP39_CUSTOMIZATION_STRING_ORIG), identifierBytes);
};

const roundFunction = (
  roundIndex: number,
  passphrase: Uint8Array,
  iterationExponent: number,
  salt: Uint8Array,
  rightHalf: Uint8Array,
): Uint8Array => {
  const password = bytesConcat(new Uint8Array([roundIndex]), passphrase);
  const roundSalt = bytesConcat(salt, rightHalf);

  return pbkdf2(sha256, password, roundSalt, {
    c: (SLIP39_BASE_ITERATION_COUNT << iterationExponent) / SLIP39_ROUND_COUNT,
    dkLen: rightHalf.length,
  });
};

export const encryptMasterSecret = (
  masterSecret: Uint8Array,
  passphrase: Uint8Array,
  iterationExponent: number,
  identifier: number,
  extendable: boolean,
): Uint8Array => {
  assert(masterSecret.length % 2 === 0, 'masterSecret byte length must be even');

  let left: Uint8Array = masterSecret.slice(0, masterSecret.length / 2);
  let right: Uint8Array = masterSecret.slice(masterSecret.length / 2);
  const salt = getSalt(identifier, extendable);

  for (let i = 0; i < SLIP39_ROUND_COUNT; i += 1) {
    const roundOutput = roundFunction(i, passphrase, iterationExponent, salt, right);
    const newLeft = right;
    const newRight = xorBytes(left, roundOutput);

    left = newLeft;
    right = newRight;
  }

  return bytesConcat(right, left);
};

export const decryptMasterSecret = (
  encryptedMasterSecret: Uint8Array,
  passphrase: Uint8Array,
  iterationExponent: number,
  identifier: number,
  extendable: boolean,
): Uint8Array => {
  assert(encryptedMasterSecret.length % 2 === 0, 'encryptedMasterSecret byte length must be even');

  let left: Uint8Array = encryptedMasterSecret.slice(0, encryptedMasterSecret.length / 2);
  let right: Uint8Array = encryptedMasterSecret.slice(encryptedMasterSecret.length / 2);
  const salt = getSalt(identifier, extendable);

  for (let i = SLIP39_ROUND_COUNT - 1; i >= 0; i -= 1) {
    const roundOutput = roundFunction(i, passphrase, iterationExponent, salt, right);
    const newLeft = right;
    const newRight = xorBytes(left, roundOutput);

    left = newLeft;
    right = newRight;
  }

  return bytesConcat(right, left);
};
