import { useState } from 'react'
import { UserButton } from '@clerk/clerk-react'
import JobCardsTab from './tabs/JobCardsTab'
import PeopleTab from './tabs/PeopleTab'
import ReportLibraryTab from './tabs/ReportLibraryTab'
import ActivityTab from './tabs/ActivityTab'
import SettingsModal from './components/SettingsModal'

const TABS = ['Job Cards', 'People', 'Library', 'Activity'] as const
type Tab = typeof TABS[number]

export default function AdminShell() {
  const [tab, setTab] = useState<Tab>('Job Cards')
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1E293B] text-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold tracking-wide">HARROWS</p>
            <p className="text-xs text-gray-400">End of day install reporting</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSettings(true)} className="text-gray-300 hover:text-white transition-colors" title="Settings">
              <GearIcon />
            </button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 border-t border-white/10 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t ? 'border-harrows-yellow text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'Job Cards' && <JobCardsTab />}
        {tab === 'People' && <PeopleTab />}
        {tab === 'Library' && <ReportLibraryTab />}
        {tab === 'Activity' && <ActivityTab />}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
