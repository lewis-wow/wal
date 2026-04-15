import { finalizeEvent, SimplePool } from 'nostr-tools';
import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import type { Uint8Array_ } from '@repo/types';
import { deriveFragmentedIdentity } from './deriveFragmentedIdentity.js';
import { NostrConnectionStatus } from './enums/NostrConnectionStatus.js';
import { NostrErrorContext } from './enums/NostrErrorContext.js';

export type NostrIdentity = {
  index: number;
  publicKey: string;
};

export type NostrMessage = {
  id: string;
  content: string;
  senderPubKey: string;
  recipientPubKey: string;
  timestamp: number;
  isOwn: boolean;
};

export type NostrDiscoveryProgress = {
  discovered: NostrIdentity[];
  scannedCount: number;
  emptyCount: number;
  done: boolean;
};

export type NostrManagerConfig = {
  getRelays: () => string[];
  getInitialIdentities?: () => NostrIdentity[];
  onConnectionStatus?: (status: NostrConnectionStatus) => void;
  onMessage?: (message: NostrMessage) => void;
  onError?: (error: unknown, context: NostrErrorContext) => void;
};

export class NostrManager {
  private readonly pool = new SimplePool();
  private seed: Uint8Array_ | null = null;
  private readonly subscribedPubkeys = new Set<string>();

  constructor(private readonly config: NostrManagerConfig) {}

  initialize(opts: { seed: Uint8Array_ }) {
    const { seed } = opts;

    this.seed = seed;
    this.subscribedPubkeys.clear();
    this.config.onConnectionStatus?.(NostrConnectionStatus.Connecting);

    const identities = this.config.getInitialIdentities?.() ?? [];
    if (identities.length > 0) {
      this.subscribeToIdentities({ identities });
    }

    setTimeout(() => {
      this.config.onConnectionStatus?.(NostrConnectionStatus.Connected);
    }, 500);
  }

  getRelays() {
    return this.config.getRelays();
  }

  async discoverIdentities(opts: {
    seed: Uint8Array_;
    gapLimit?: number;
    relayQueryMaxWaitMs?: number;
    discoveryBatchSize?: number;
    onProgress?: (progress: NostrDiscoveryProgress) => void;
  }) {
    const { seed, gapLimit = 20, relayQueryMaxWaitMs = 1200, discoveryBatchSize = gapLimit, onProgress } = opts;

    let emptyCount = 0;
    let index = 0;
    const discovered: NostrIdentity[] = [];
    const batchSize = Math.max(1, discoveryBatchSize);

    while (emptyCount < gapLimit) {
      const batchCandidates = Array.from({ length: batchSize }, (_, offset) => {
        const candidateIndex = index + offset;
        const { publicKey } = deriveFragmentedIdentity(seed, candidateIndex);
        return {
          index: candidateIndex,
          publicKey,
        };
      });

      const candidatePubKeySet = new Set(batchCandidates.map((candidate) => candidate.publicKey.toLowerCase()));
      const filters: Filter[] = batchCandidates.flatMap((candidate) => [
        {
          kinds: [4],
          authors: [candidate.publicKey],
          limit: 1,
        },
        {
          kinds: [4],
          '#p': [candidate.publicKey],
          limit: 1,
        },
      ]);

      const events = await this.querySyncWithFilters({
        filters,
        maxWaitMs: relayQueryMaxWaitMs,
      });
      const activePubKeys = new Set<string>();

      for (const event of events) {
        const senderPubKey = event.pubkey.toLowerCase();
        if (candidatePubKeySet.has(senderPubKey)) {
          activePubKeys.add(senderPubKey);
        }

        const recipientTag = event.tags.find((tag) => tag[0] === 'p');
        const recipientPubKey = recipientTag?.[1]?.toLowerCase();
        if (recipientPubKey && candidatePubKeySet.has(recipientPubKey)) {
          activePubKeys.add(recipientPubKey);
        }
      }

      for (const candidate of batchCandidates) {
        discovered.push({ index: candidate.index, publicKey: candidate.publicKey });

        if (activePubKeys.has(candidate.publicKey.toLowerCase())) {
          emptyCount = 0;
        } else {
          emptyCount += 1;
        }

        index = candidate.index + 1;

        if (emptyCount >= gapLimit) {
          break;
        }
      }

      onProgress?.({
        discovered: [...discovered],
        scannedCount: discovered.length,
        emptyCount,
        done: false,
      });
    }

    onProgress?.({
      discovered: [...discovered],
      scannedCount: discovered.length,
      emptyCount,
      done: true,
    });

    return discovered;
  }

  private querySyncWithFilters(opts: { filters: Filter[]; maxWaitMs: number }) {
    const { filters, maxWaitMs } = opts;

    if (filters.length === 0) {
      return Promise.resolve([] as NostrEvent[]);
    }

    const relayRequests = this.getRelays().flatMap((relayUrl) =>
      filters.map((filter) => ({
        url: relayUrl,
        filter,
      })),
    );

    return new Promise<NostrEvent[]>((resolve) => {
      const eventsById = new Map<string, NostrEvent>();

      this.pool.subscribeMap(relayRequests, {
        maxWait: maxWaitMs,
        onevent: (event) => {
          eventsById.set(event.id, event);
        },
        onclose: () => {
          resolve([...eventsById.values()]);
        },
      });
    });
  }

  subscribeToIdentities(opts: { identities: NostrIdentity[] }) {
    const { identities } = opts;

    if (identities.length === 0) return;

    const identitiesToSubscribe = identities.filter((identity) => !this.subscribedPubkeys.has(identity.publicKey));
    if (identitiesToSubscribe.length === 0) return;

    const pubkeys = identitiesToSubscribe.map((identity) => {
      this.subscribedPubkeys.add(identity.publicKey);
      return identity.publicKey;
    });
    const filters = [
      { kinds: [4], '#p': pubkeys },
      { kinds: [4], authors: pubkeys },
    ];

    filters.forEach((filter) => {
      this.pool.subscribeMany(this.getRelays(), filter, {
        onevent: (event) => {
          this.handleEvent({ event, identities });
        },
      });
    });
  }

  async sendNip44Message(opts: { identityIndex: number; contactPubKey: string; message: string }) {
    const { identityIndex, contactPubKey, message } = opts;

    if (!this.seed) {
      throw new Error('Not initialized');
    }

    const { privateKey, publicKey } = deriveFragmentedIdentity(this.seed, identityIndex);
    const convKey = getConversationKey(privateKey, contactPubKey);
    const ciphertext = encrypt(message, convKey);

    const template: EventTemplate = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', contactPubKey]],
      content: ciphertext,
    };

    const signedEvent = finalizeEvent(template, privateKey);

    try {
      const publishResults = await Promise.allSettled(this.pool.publish(this.getRelays(), signedEvent));
      const hasPublishedRelay = publishResults.some((result) => result.status === 'fulfilled');

      if (!hasPublishedRelay) {
        const rejectedReasons = publishResults
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason);

        this.config.onError?.(
          new AggregateError(rejectedReasons, 'Failed to publish event to all relays'),
          NostrErrorContext.Publish,
        );
      }
    } catch (error) {
      this.config.onError?.(error, NostrErrorContext.Publish);
    }

    const outgoingMessage: NostrMessage = {
      id: signedEvent.id,
      content: message,
      senderPubKey: publicKey,
      recipientPubKey: contactPubKey,
      timestamp: signedEvent.created_at,
      isOwn: true,
    };

    this.config.onMessage?.(outgoingMessage);
    return outgoingMessage;
  }

  private handleEvent(opts: { event: NostrEvent; identities: NostrIdentity[] }) {
    const { event, identities } = opts;

    if (!this.seed) return;

    const recipientTag = event.tags.find((tag) => tag[0] === 'p');
    const recipientHex = recipientTag?.[1];
    const senderHex = event.pubkey;

    const identity = identities.find((item) => item.publicKey === recipientHex || item.publicKey === senderHex);
    if (!identity) return;

    const isOwn = identity.publicKey === senderHex;
    const contactPubKey = isOwn && recipientHex ? recipientHex : senderHex;
    const { privateKey } = deriveFragmentedIdentity(this.seed, identity.index);

    let content = event.content;
    try {
      if (event.kind === 4) {
        const convKey = getConversationKey(privateKey, contactPubKey);
        content = decrypt(event.content, convKey);
      }
    } catch (error) {
      this.config.onError?.(error, NostrErrorContext.Decrypt);
      return;
    }

    this.config.onMessage?.({
      id: event.id,
      content,
      senderPubKey: senderHex,
      recipientPubKey: recipientHex ?? '',
      timestamp: event.created_at,
      isOwn,
    });
  }
}
