import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { NostrManagerProvider } from '@repo/nostr/react';
import { chatStore, useAppSelector } from './lib/chat-store';
import { nostrManagerConfig } from './lib/nostrManager';
import { router } from './router';
import './styles.css';

const ChatNostrProvider = (opts: { children: React.ReactNode }) => {
  const { children } = opts;
  const seed = useAppSelector((state) => state.chat.seed);

  return (
    <NostrManagerProvider config={nostrManagerConfig} seed={seed}>
      {children}
    </NostrManagerProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={chatStore}>
      <ChatNostrProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors />
      </ChatNostrProvider>
    </Provider>
  </React.StrictMode>,
);
