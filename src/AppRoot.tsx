import { SignedIn, SignedOut } from '@clerk/clerk-react'
import InstallerApp from './InstallerApp'
import AdminShell from './AdminShell'
import AdminLoginPage from './AdminLoginPage'

export default function AppRoot() {
  // The installer PIN flow never touches Clerk — same "escape hatch before the
  // <SignedIn> wrapper" trick Harrows-dashboard uses for its /snapshot/* pages.
  const path = window.location.pathname.replace(/\/$/, '')
  if (path === '/report' || path.startsWith('/report/')) {
    return <InstallerApp />
  }

  return (
    <>
      <SignedIn><AdminShell /></SignedIn>
      <SignedOut><AdminLoginPage /></SignedOut>
    </>
  )
}
