import { sha256 } from '@noble/hashes/sha2';

export const doubleSha256Checksum = (payload: Uint8Array): Uint8Array => {
  return sha256(sha256(payload)).slice(0, 4);
};
