import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { walletStore } from './lib/wallet-store';
import { router } from './router';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={walletStore}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </Provider>
  </React.StrictMode>,
);
