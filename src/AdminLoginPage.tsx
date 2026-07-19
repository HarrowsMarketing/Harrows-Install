import { SignIn } from '@clerk/clerk-react'

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <img src="/Harrows_Logo2023_Icon_Charcoal_R_RGB.png" alt="Harrows" className="w-12 h-12 mb-6" />
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Harrows Install EOD</h1>
      <p className="text-sm text-gray-400 mb-8">Office &amp; admin sign in</p>
      <SignIn routing="hash" />
      <a href="/report" className="mt-8 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        Installer? Go to the site report page &rarr;
      </a>
    </div>
  )
}
