import type { ValueOfTuple } from '@repo/types';

// The mnemonic must encode entropy in a multiple of 32 bits.
// With more entropy security is improved but the sentence length increases.
// We refer to the initial entropy length as ENT.
// The allowed size of ENT is 128-256 bits.
export const BIP39_ALLOWED_ENTROPY_BITS = [128, 160, 192, 224, 256] as const;
export type Bip39EntropyBits = ValueOfTuple<typeof BIP39_ALLOWED_ENTROPY_BITS>;

export const BIP39_ALLOWED_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
