import { secp256k1 } from '@noble/curves/secp256k1';
import { masterFromSeed } from '@repo/bip32';
import type { Uint8Array_ } from '@repo/types';
import { bigIntToBytes, bytesToBigInt } from '@repo/utils';
import { getPublicKey } from 'nostr-tools/pure';

export type FragmentedIdentity = {
  index: number;
  privateKey: Uint8Array_;
  publicKey: string;
};

export const deriveFragmentedIdentity = (seed: Uint8Array_, index: number): FragmentedIdentity => {
  const masterNode = masterFromSeed({ seed });

  const identityNode = masterNode.derivePath(`m/0'/0'/0'/0/${index}`);
  const blindingNode = masterNode.derivePath(`m/0'/0'/100'/0/${index}`);

  const kBytes = identityNode.privateKey;
  const bBytes = blindingNode.privateKey;

  if (!kBytes || !bBytes) {
    throw new Error('Failed to derive private keys');
  }

  const k = bytesToBigInt(kBytes);
  const b = bytesToBigInt(bBytes);

  const n = secp256k1.Point.CURVE().n;
  const blindedK = (k + b) % n;

  const privateKey = bigIntToBytes(blindedK, 32);
  const publicKey = getPublicKey(privateKey);

  return {
    index,
    privateKey,
    publicKey,
  };
};
