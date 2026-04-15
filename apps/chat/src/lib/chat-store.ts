import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import type { Uint8Array_ } from '@repo/types'

export type NostrMessage = {
  id: string
  content: string
  senderPubKey: string
  recipientPubKey: string
  timestamp: number
  isOwn: boolean
}

export type FragmentedIdentity = {
  index: number
  publicKey: string
  activeChatPubKey?: string
}

export type ChatState = {
  seed: Uint8Array_ | null
  identities: FragmentedIdentity[]
  messages: Record<string, NostrMessage[]>
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  relays: string[]
}

const initialState: ChatState = {
  seed: null,
  identities: [],
  messages: {},
  connectionStatus: 'disconnected',
  relays: [import.meta.env.VITE_DEFAULT_NOSTR_RELAYS ?? 'wss://relay.damus.io']
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setSeed: (state, action: PayloadAction<Uint8Array_ | null>) => {
      state.seed = action.payload
    },
    addIdentity: (state, action: PayloadAction<FragmentedIdentity>) => {
      const exists = state.identities.find(i => i.index === action.payload.index)
      if (!exists) {
        state.identities.push(action.payload)
      }
    },
    setIdentities: (state, action: PayloadAction<FragmentedIdentity[]>) => {
      state.identities = action.payload
    },
    addMessage: (state, action: PayloadAction<NostrMessage>) => {
      const chatPartner = action.payload.isOwn ? action.payload.recipientPubKey : action.payload.senderPubKey
      if (!state.messages[chatPartner]) {
        state.messages[chatPartner] = []
      }
      
      const exists = state.messages[chatPartner].find(m => m.id === action.payload.id)
      if (!exists) {
        state.messages[chatPartner].push(action.payload)
        state.messages[chatPartner].sort((a, b) => a.timestamp - b.timestamp)
      }
    },
    setConnectionStatus: (state, action: PayloadAction<ChatState['connectionStatus']>) => {
      state.connectionStatus = action.payload
    },
    setActiveChat: (state, action: PayloadAction<{ index: number, contactPubKey: string }>) => {
      const id = state.identities.find(i => i.index === action.payload.index)
      if (id) {
        id.activeChatPubKey = action.payload.contactPubKey
      }
    }
  }
})

export const { setSeed, addIdentity, setIdentities, addMessage, setConnectionStatus, setActiveChat } = chatSlice.actions

export const chatStore = configureStore({
  reducer: {
    chat: chatSlice.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['chat/setSeed'],
        ignoredPaths: ['chat.seed']
      }
    })
})

export type RootState = ReturnType<typeof chatStore.getState>
export type AppDispatch = typeof chatStore.dispatch

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
