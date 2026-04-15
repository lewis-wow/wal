import { NostrErrorContext, type NostrManagerConfig } from '@repo/nostr';
import { addMessage, setConnectionStatus } from './chat-store';
import { chatStore } from './chat-store';

export const nostrManagerConfig: NostrManagerConfig = {
  getRelays: () => chatStore.getState().chat.relays,
  getInitialIdentities: () => chatStore.getState().chat.identities,
  onConnectionStatus: (status) => {
    chatStore.dispatch(setConnectionStatus(status));
  },
  onMessage: (message) => {
    chatStore.dispatch(addMessage(message));
  },
  onError: (error, context) => {
    if (context === NostrErrorContext.Decrypt) {
      console.error('Failed to decrypt event', error);
      return;
    }

    console.warn('Publish threw:', error);
  },
};
