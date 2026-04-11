import type { ValueOfEnum } from '@repo/types';

export const Bip32Network = {
  Mainnet: 'mainnet',
  Testnet: 'testnet',
} as const;

export type Bip32Network = ValueOfEnum<typeof Bip32Network>;
