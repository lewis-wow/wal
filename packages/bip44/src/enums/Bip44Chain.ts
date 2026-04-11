import type { ValueOfEnum } from '@repo/types';

export const Bip44Chain = {
  External: 0,
  Internal: 1,
} as const;

export type Bip44Chain = ValueOfEnum<typeof Bip44Chain>;
