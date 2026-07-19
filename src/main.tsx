import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import AppRoot from './AppRoot'
import { installApiAuth } from './lib/api'
import './index.css'

installApiAuth()

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
      <AppRoot />
    </ClerkProvider>
  </React.StrictMode>,
)
