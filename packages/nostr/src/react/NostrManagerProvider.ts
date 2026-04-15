import { createContext, createElement, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { Uint8Array_ } from '@repo/types';
import {
  NostrManager,
  type NostrDiscoveryProgress,
  type NostrIdentity,
  type NostrManagerConfig,
  type NostrMessage,
} from '../NostrManager.js';

export type NostrManagerProviderProps = {
  children: ReactNode;
  config: NostrManagerConfig;
  seed?: Uint8Array_ | null;
};

export type NostrManagerActions = {
  initialize: (opts: { seed: Uint8Array_ }) => void;
  getRelays: () => string[];
  discoverIdentities: (opts: {
    seed: Uint8Array_;
    gapLimit?: number;
    relayQueryMaxWaitMs?: number;
    discoveryBatchSize?: number;
    onProgress?: (progress: NostrDiscoveryProgress) => void;
  }) => Promise<NostrIdentity[]>;
  subscribeToIdentities: (opts: { identities: NostrIdentity[] }) => void;
  sendNip44Message: (opts: { identityIndex: number; contactPubKey: string; message: string }) => Promise<NostrMessage>;
};

const NostrManagerContext = createContext<NostrManager | null>(null);

export const NostrManagerProvider = (opts: NostrManagerProviderProps) => {
  const { children, config, seed } = opts;

  const manager = useMemo(() => new NostrManager(config), [config]);

  useEffect(() => {
    if (!seed) {
      return;
    }

    manager.initialize({ seed });
  }, [manager, seed]);

  return createElement(NostrManagerContext.Provider, { value: manager }, children);
};

export const useNostrManager = () => {
  const manager = useContext(NostrManagerContext);

  if (!manager) {
    throw new Error('useNostrManager must be used within NostrManagerProvider');
  }

  return manager;
};

export const useNostrManagerActions = (): NostrManagerActions => {
  const manager = useNostrManager();

  const initialize = useCallback((opts: { seed: Uint8Array_ }) => manager.initialize(opts), [manager]);
  const getRelays = useCallback(() => manager.getRelays(), [manager]);
  const discoverIdentities = useCallback(
    (opts: {
      seed: Uint8Array_;
      gapLimit?: number;
      relayQueryMaxWaitMs?: number;
      discoveryBatchSize?: number;
      onProgress?: (progress: NostrDiscoveryProgress) => void;
    }) => manager.discoverIdentities(opts),
    [manager],
  );
  const subscribeToIdentities = useCallback(
    (opts: { identities: NostrIdentity[] }) => manager.subscribeToIdentities(opts),
    [manager],
  );
  const sendNip44Message = useCallback(
    (opts: { identityIndex: number; contactPubKey: string; message: string }) => manager.sendNip44Message(opts),
    [manager],
  );

  return {
    initialize,
    getRelays,
    discoverIdentities,
    subscribeToIdentities,
    sendNip44Message,
  };
};
