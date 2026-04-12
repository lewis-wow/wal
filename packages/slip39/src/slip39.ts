import { assert } from '@repo/assert';
import type { Uint8Array_ } from '@repo/types';
import { SLIP39_MAX_SHARE_COUNT, SLIP39_MIN_STRENGTH_BITS } from './consts.js';
import { decryptMasterSecret, encryptMasterSecret } from './helpers/encryption.js';
import { decodeSlip39Mnemonic, encodeSlip39Mnemonic } from './helpers/mnemonicCodec.js';
import type { Slip39RawShare } from './helpers/gf256.js';
import { assertIntegerInRange, assertPrintableAscii, toRawShares } from './helpers/shareValidation.js';
import { recoverSecret, splitSecret } from './helpers/secretSharing.js';
import type { Slip39GenerateOptions, Slip39GeneratedShare, Slip39Share } from './types.js';
import { getRandomBytes } from '@repo/crypto';

const textEncoder = new TextEncoder();

/**
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0039.md#generating-the-shares
 */
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

  // Generate a random 15-bit value id.
  const randomBytes = getRandomBytes(2);
  // e.g. bytes[0]: 11001101, bytes[1]: 00111001 (2 8bit numbers)
  // bytes[0] << 8: 11001101 00000000
  // | bytes[1]: 11001101 00111001 (1 16bit number)
  // & 0x7fff: 11001101 00111001 & 01111111 11111111 = 01001101 00111001 (1 15bit number)
  const identifier = ((randomBytes[0]! << 8) | randomBytes[1]!) & 0x7fff;
  assertIntegerInRange(identifier, 0, 0x7fff, 'identifier');

  // let ext = 1
  const extendable = true;

  // Compute the encrypted master secret EMS = Encrypt(MS, P, e, id, ext).
  const encryptedMasterSecret = encryptMasterSecret(
    masterSecret,
    textEncoder.encode(passphrase),
    iterationExponent,
    identifier,
    extendable,
  );

  // Compute the group shares s1, ... , sG = SplitSecret(GT, G, EMS).
  const groupShares = splitSecret(groupThreshold, groups.length, encryptedMasterSecret);

  const generated: Slip39GeneratedShare[] = [];

  // For each group share si, 1 ≤ i ≤ G, compute the member shares si,1, ... , si,Ni = SplitSecret(Ti, Ni, si).
  for (const [groupConfig, groupShare] of groups.map((group, index) => [group, groupShares[index]!] as const)) {
    const memberShares = splitSecret(groupConfig.memberThreshold, groupConfig.memberCount, groupShare.value);

    // For each i and each j, 1 ≤ i ≤ G, 1 ≤ j ≤ Ni, return (id, ext, e, i − 1, GT − 1, j − 1, Ti − 1, si,j).
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
        value: memberShare.value as Uint8Array_,
      };

      generated.push({
        ...share,
        mnemonic: encodeSlip39Mnemonic(share),
      });
    }
  }

  return generated;
};

/**
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0039.md#combining-the-shares
 */
export const combineSlip39Shares = (mnemonics: string[], passphrase = ''): Uint8Array_ => {
  assert(mnemonics.length > 0, 'mnemonics must not be empty');
  assertPrintableAscii(passphrase, 'passphrase');

  const decodedShares = mnemonics.map((mnemonic) => decodeSlip39Mnemonic(mnemonic));
  const baseShare = decodedShares[0]!;

  // All shares MUST have the same
  for (const share of decodedShares) {
    // identifier id
    assert(share.identifier === baseShare.identifier, 'All mnemonics must have the same identifier');
    // extendable backup flag ext
    assert(share.extendable === baseShare.extendable, 'All mnemonics must have the same extendable flag');
    // iteration exponent e
    assert(
      share.iterationExponent === baseShare.iterationExponent,
      'All mnemonics must have the same iteration exponent',
    );
    // group threshold GT
    assert(share.groupThreshold === baseShare.groupThreshold, 'All mnemonics must have the same group threshold');
    // group count G
    assert(share.groupCount === baseShare.groupCount, 'All mnemonics must have the same group count');
    // and length
    assert(share.value.length === baseShare.value.length, 'All mnemonics must have the same share value length');

    const valueBits = share.value.length * 8;
    assert(valueBits >= SLIP39_MIN_STRENGTH_BITS, `Share value must be at least ${SLIP39_MIN_STRENGTH_BITS} bits`);
    assert(share.groupIndex >= 0 && share.groupIndex < share.groupCount, 'groupIndex must be within groupCount bounds');
  }

  // The value of G MUST be greater than or equal to GT
  assert(
    baseShare.groupCount >= baseShare.groupThreshold,
    'groupCount must be greater than or equal to groupThreshold',
  );

  // Let GM be the number of pairwise distinct group indices among the given shares.
  const groups = new Map<number, Slip39Share[]>();

  for (const share of decodedShares) {
    if (!groups.has(share.groupIndex)) {
      groups.set(share.groupIndex, []);
    }

    groups.get(share.groupIndex)!.push(share);
  }

  // Then GM MUST be equal to GT.
  assert(
    groups.size === baseShare.groupThreshold,
    `Expected ${baseShare.groupThreshold} mnemonic groups, but received ${groups.size}`,
  );

  const groupRawShares: Slip39RawShare[] = [];

  // All shares with a given group index GIi, 1 ≤ i ≤ GM,
  // MUST have the same member threshold Ti,
  // their member indices MUST be pairwise distinct
  // and their count Mi MUST be equal to Ti.
  for (const [groupIndex, groupShares] of groups) {
    const memberThreshold = groupShares[0]!.memberThreshold;

    for (const share of groupShares) {
      assert(
        share.memberThreshold === memberThreshold,
        `All mnemonics in group ${groupIndex} must have the same member threshold`,
      );
    }

    const uniqueMemberIndices = new Set(groupShares.map((share) => share.memberIndex));

    // their member indices MUST be pairwise distinct = Member indices MUST be unique
    assert(uniqueMemberIndices.size === groupShares.length, `Duplicate member indices detected in group ${groupIndex}`);

    // their count Mi MUST be equal to Ti
    assert(
      groupShares.length === memberThreshold,
      `Group ${groupIndex} requires exactly ${memberThreshold} mnemonics, but received ${groupShares.length}`,
    );

    // Let si = RecoverSecret([(Ii,1, si,1), ... , (Ii,Mi, si,Mi)]),
    // where Ii,j and si,j are the member-index/share-value pairs of the shares with group index GIi.
    groupRawShares.push({
      x: groupIndex,
      value: recoverSecret(
        memberThreshold,
        toRawShares(groupShares, (share) => share.memberIndex),
      ),
    });
  }

  // Let EMS = RecoverSecret([(GI1, s1), ... , (GIGM, sGM)])
  const encryptedMasterSecret = recoverSecret(baseShare.groupThreshold, groupRawShares);

  // Return MS = Decrypt(EMS, P, e, id, ext).
  const masterSecret = decryptMasterSecret(
    encryptedMasterSecret,
    textEncoder.encode(passphrase),
    baseShare.iterationExponent,
    baseShare.identifier,
    baseShare.extendable,
  );

  return masterSecret as Uint8Array_;
};
