import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { Uint8Array_ } from '@repo/types';

export type NostrMessage = {
  id: string;
  content: string;
  senderPubKey: string;
  recipientPubKey: string;
  timestamp: number;
  isOwn: boolean;
};

export type FragmentedIdentity = {
  index: number;
  publicKey: string;
  activeChatPubKey?: string;
  chatLabel?: string;
};

export type ChatState = {
  seed: Uint8Array_ | null;
  identities: FragmentedIdentity[];
  activeIdentityIndex: number | null;
  messages: Record<string, NostrMessage[]>;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  relays: string[];
};

const initialState: ChatState = {
  seed: null,
  identities: [],
  activeIdentityIndex: null,
  messages: {},
  connectionStatus: 'disconnected',
  relays: [import.meta.env.VITE_DEFAULT_NOSTR_RELAYS ?? 'wss://relay.damus.io'],
};

const normalizePubKey = (pubKey: string) => pubKey.trim().toLowerCase();

export const getConversationThreadKey = (opts: { localPubKey: string; partnerPubKey: string }) => {
  const { localPubKey, partnerPubKey } = opts;
  return `${normalizePubKey(localPubKey)}:${normalizePubKey(partnerPubKey)}`;
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setSeed: (state, action: PayloadAction<Uint8Array_ | null>) => {
      state.seed = action.payload;
    },
    addIdentity: (state, action: PayloadAction<FragmentedIdentity>) => {
      const exists = state.identities.find((i) => i.index === action.payload.index);
      if (!exists) {
        state.identities.push(action.payload);

        if (action.payload.activeChatPubKey) {
          state.activeIdentityIndex = action.payload.index;
        }
      }
    },
    linkIdentityToChat: (state, action: PayloadAction<{ index: number; contactPubKey: string; chatLabel: string }>) => {
      const identity = state.identities.find((item) => item.index === action.payload.index);
      if (!identity) return;

      identity.activeChatPubKey = action.payload.contactPubKey;
      identity.chatLabel = action.payload.chatLabel;
      state.activeIdentityIndex = action.payload.index;
    },
    updateChatLabel: (state, action: PayloadAction<{ index: number; chatLabel: string }>) => {
      const identity = state.identities.find((item) => item.index === action.payload.index);
      if (!identity) return;

      identity.chatLabel = action.payload.chatLabel;
    },
    setIdentities: (state, action: PayloadAction<FragmentedIdentity[]>) => {
      state.identities = action.payload;

      const firstChatIdentity = action.payload.find((identity) => Boolean(identity.activeChatPubKey));

      if (state.activeIdentityIndex === null) {
        state.activeIdentityIndex = firstChatIdentity?.index ?? null;
        return;
      }

      const hasActiveIdentity = action.payload.some((identity) => identity.index === state.activeIdentityIndex);
      if (!hasActiveIdentity) {
        state.activeIdentityIndex = firstChatIdentity?.index ?? null;
      }
    },
    addMessage: (state, action: PayloadAction<NostrMessage>) => {
      const senderPubKey = normalizePubKey(action.payload.senderPubKey);
      const recipientPubKey = normalizePubKey(action.payload.recipientPubKey);
      const localPubKey = action.payload.isOwn ? senderPubKey : recipientPubKey;
      const chatPartner = action.payload.isOwn ? recipientPubKey : senderPubKey;

      if (!localPubKey || !chatPartner) {
        return;
      }

      const threadKey = getConversationThreadKey({
        localPubKey,
        partnerPubKey: chatPartner,
      });

      const message: NostrMessage = {
        ...action.payload,
        senderPubKey,
        recipientPubKey,
      };

      if (!message.isOwn) {
        const incomingSenderPubKey = message.senderPubKey;
        const incomingRecipientPubKey = message.recipientPubKey;

        const hasExistingChatForSender = state.identities.some(
          (identity) => identity.activeChatPubKey?.toLowerCase() === incomingSenderPubKey,
        );

        if (!hasExistingChatForSender && incomingRecipientPubKey) {
          const recipientIdentity = state.identities.find(
            (identity) => identity.publicKey.toLowerCase() === incomingRecipientPubKey,
          );

          if (recipientIdentity && !recipientIdentity.activeChatPubKey) {
            recipientIdentity.activeChatPubKey = incomingSenderPubKey;
            if (!recipientIdentity.chatLabel) {
              recipientIdentity.chatLabel = `New chat ${incomingSenderPubKey.slice(0, 8)}`;
            }

            if (state.activeIdentityIndex === null) {
              state.activeIdentityIndex = recipientIdentity.index;
            }
          }
        }
      }

      if (!state.messages[threadKey]) {
        state.messages[threadKey] = [];
      }

      const exists = state.messages[threadKey].find((item) => item.id === message.id);
      if (!exists) {
        state.messages[threadKey].push(message);
        state.messages[threadKey].sort((a, b) => a.timestamp - b.timestamp);
      }
    },
    setConnectionStatus: (state, action: PayloadAction<ChatState['connectionStatus']>) => {
      state.connectionStatus = action.payload;
    },
    setActiveIdentity: (state, action: PayloadAction<{ index: number }>) => {
      state.activeIdentityIndex = action.payload.index;
    },
  },
});

export const {
  setSeed,
  addIdentity,
  linkIdentityToChat,
  updateChatLabel,
  setIdentities,
  addMessage,
  setConnectionStatus,
  setActiveIdentity,
} = chatSlice.actions;

export const chatStore = configureStore({
  reducer: {
    chat: chatSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['chat/setSeed'],
        ignoredPaths: ['chat.seed'],
      },
    }),
});

export type RootState = ReturnType<typeof chatStore.getState>;
export type AppDispatch = typeof chatStore.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
