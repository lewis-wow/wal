import { describe, expect, test } from 'vitest';
import waitForExpect from 'wait-for-expect';

import type { Uint8Array_ } from '@repo/types';
import {
  deriveFragmentedIdentity,
  NostrConnectionStatus,
  NostrErrorContext,
  NostrManager,
  type NostrErrorContext as NostrErrorContextType,
  type NostrMessage,
} from '../src/index.js';

const RELAYS = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nos.lol'];
const TEST_SEED = new Uint8Array(64).fill(7) as Uint8Array_;

describe.sequential('NostrManager integration (live relays)', () => {
  test('emits connecting then connected statuses on initialize', async () => {
    const statuses: string[] = [];

    const manager = new NostrManager({
      getRelays: () => RELAYS,
      onConnectionStatus: (status) => {
        statuses.push(status);
      },
    });

    manager.initialize({ seed: TEST_SEED });
    await waitForExpect(() => {
      expect(statuses).toEqual([NostrConnectionStatus.Connecting, NostrConnectionStatus.Connected]);
    });
  });

  test('discovers identities against public relays', async () => {
    const manager = new NostrManager({
      getRelays: () => RELAYS,
    });

    const discovered = await manager.discoverIdentities({
      seed: TEST_SEED,
      gapLimit: 1,
    });

    expect(discovered.length).toBeGreaterThanOrEqual(1);
    expect(discovered[0]?.index).toBe(0);
    expect(discovered[0]?.publicKey).toMatch(/^[a-f0-9]{64}$/u);
    discovered.forEach((identity) => {
      expect(identity.publicKey).toMatch(/^[a-f0-9]{64}$/u);
    });
  });

  test('sends a nip44 message and emits the outgoing message callback', async () => {
    const messages: NostrMessage[] = [];
    const errors: Array<{ context: NostrErrorContextType; error: unknown }> = [];

    const manager = new NostrManager({
      getRelays: () => RELAYS,
      onMessage: (message) => {
        messages.push(message);
      },
      onError: (error, context) => {
        errors.push({ error, context });
      },
    });

    manager.initialize({ seed: TEST_SEED });

    const { publicKey } = deriveFragmentedIdentity(TEST_SEED, 0);
    const outgoingMessage = await manager.sendNip44Message({
      identityIndex: 0,
      contactPubKey: publicKey,
      message: `integration ping ${Date.now()}`,
    });

    expect(outgoingMessage.isOwn).toBe(true);
    expect(outgoingMessage.senderPubKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(outgoingMessage.recipientPubKey).toBe(publicKey);
    expect(messages.at(-1)?.id).toBe(outgoingMessage.id);

    const decryptErrors = errors.filter((entry) => entry.context === NostrErrorContext.Decrypt);
    expect(decryptErrors).toHaveLength(0);
  });
});
