import type { ValueOfEnum } from '@repo/types';

export const NostrConnectionStatus = {
  Connecting: 'connecting',
  Connected: 'connected',
} as const;

export type NostrConnectionStatus = ValueOfEnum<typeof NostrConnectionStatus>;
