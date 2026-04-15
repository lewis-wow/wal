import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { Provider } from 'react-redux'
import { Toaster } from 'sonner'
import { chatStore } from './lib/chat-store'
import { router } from './router'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={chatStore}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </Provider>
  </React.StrictMode>
)
