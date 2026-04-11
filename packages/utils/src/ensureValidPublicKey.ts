import { secp256k1 } from '@noble/curves/secp256k1';

export const ensureValidPublicKey = (publicKey: Uint8Array): void => {
  if (publicKey.length !== 33) {
    throw new Error('Compressed public key must be 33 bytes');
  }

  if (publicKey[0] !== 0x02 && publicKey[0] !== 0x03) {
    throw new Error('Invalid compressed public key prefix');
  }

  void secp256k1.Point.fromHex(publicKey);
};
