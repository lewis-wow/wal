import { get, set } from 'idb-keyval';
import type { FragmentedIdentity } from './chat-store';

const CHAT_PUBLIC_KEYS_KEY = 'nostr-chat:chat-public-keys';
const CHAT_IDENTITIES_KEY = 'nostr-chat:identities';

const normalizePubKeys = (pubKeys: string[]): string[] => {
  const normalized = pubKeys.map((pubKey) => pubKey.trim().toLowerCase()).filter((pubKey) => pubKey.length > 0);

  return Array.from(new Set(normalized));
};

export const saveChatPublicKeys = async (pubKeys: string[]): Promise<void> => {
  await set(CHAT_PUBLIC_KEYS_KEY, normalizePubKeys(pubKeys));
};

export const loadChatPublicKeys = async (): Promise<string[]> => {
  const cached = await get<string[] | undefined>(CHAT_PUBLIC_KEYS_KEY);
  return normalizePubKeys(cached ?? []);
};

const normalizeIdentities = (identities: FragmentedIdentity[]): FragmentedIdentity[] => {
  const byIndex = new Map<number, FragmentedIdentity>();

  identities.forEach((identity) => {
    if (!Number.isInteger(identity.index) || identity.index < 0) {
      return;
    }

    const normalizedPublicKey = identity.publicKey.trim().toLowerCase();
    if (normalizedPublicKey.length !== 64) {
      return;
    }

    const normalizedChatPubKey = identity.activeChatPubKey?.trim().toLowerCase();
    const normalizedLabel = identity.chatLabel?.trim();

    byIndex.set(identity.index, {
      index: identity.index,
      publicKey: normalizedPublicKey,
      activeChatPubKey: normalizedChatPubKey && normalizedChatPubKey.length > 0 ? normalizedChatPubKey : undefined,
      chatLabel: normalizedLabel && normalizedLabel.length > 0 ? normalizedLabel : undefined,
    });
  });

  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
};

export const saveCachedIdentities = async (identities: FragmentedIdentity[]): Promise<void> => {
  await set(CHAT_IDENTITIES_KEY, normalizeIdentities(identities));
};

export const loadCachedIdentities = async (): Promise<FragmentedIdentity[]> => {
  const cached = await get<FragmentedIdentity[] | undefined>(CHAT_IDENTITIES_KEY);
  return normalizeIdentities(cached ?? []);
};
