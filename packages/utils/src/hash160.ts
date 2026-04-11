import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';

export const hash160 = (value: Uint8Array): Uint8Array => {
  return ripemd160(sha256(value));
};
