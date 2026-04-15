import type { ValueOfEnum } from '@repo/types';

export const NostrErrorContext = {
  Decrypt: 'decrypt',
  Publish: 'publish',
} as const;

export type NostrErrorContext = ValueOfEnum<typeof NostrErrorContext>;
