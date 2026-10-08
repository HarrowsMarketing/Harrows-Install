import { SignedIn, SignedOut } from '@clerk/clerk-react'
import InstallerApp from './InstallerApp'
import AdminShell from './AdminShell'
import AdminLoginPage from './AdminLoginPage'
import { getInstallerToken } from './utils/installerSession'

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

  // /returns/<id> is the link printed on return tags (QR) and in notification emails, and
  // either kind of user may follow it: a PIN session wins if one exists on this device,
  // otherwise a signed-in office user gets the admin shell, otherwise the PIN screen
  // (whose "office staff" link carries the return through to /admin/returns/<id>).
  if (path.startsWith('/returns/') && !getInstallerToken()) {
    return (
      <>
        <SignedIn><AdminShell /></SignedIn>
        <SignedOut><InstallerApp /></SignedOut>
      </>
    )
  }

  return <InstallerApp />
}
