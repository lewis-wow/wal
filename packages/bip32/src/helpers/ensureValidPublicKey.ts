import { secp256k1 } from '@noble/curves/secp256k1';
import { assert } from '@repo/assert';

export const ensureValidPublicKey = (publicKey: Uint8Array): void => {
  assert(publicKey.length === 33, 'Compressed public key must be 33 bytes');
  assert(publicKey[0] === 0x02 || publicKey[0] === 0x03, 'Invalid compressed public key prefix');
  void secp256k1.Point.fromHex(publicKey);
};
