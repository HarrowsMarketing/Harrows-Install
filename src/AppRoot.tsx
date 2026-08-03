import { SignedIn, SignedOut } from '@clerk/clerk-react'
import InstallerApp from './InstallerApp'
import AdminShell from './AdminShell'
import AdminLoginPage from './AdminLoginPage'

export default function AppRoot() {
  // Installers are the default landing experience (most traffic is the install crew
  // on their phones) — the PIN flow never touches Clerk at all, same "escape hatch
  // before the <SignedIn> wrapper" trick Harrows-dashboard uses for its /snapshot/*
  // pages. Office/admin sign-in is deliberately tucked behind /admin instead.
  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/admin' || path.startsWith('/admin/')) {
    return (
      <>
        <SignedIn><AdminShell /></SignedIn>
        <SignedOut><AdminLoginPage /></SignedOut>
      </>
    )
  }

  return <InstallerApp />
}
