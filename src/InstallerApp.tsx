import { useEffect, useState } from 'react'
import axios from 'axios'
import { getInstallerInfo, getInstallerToken, setInstallerSession, clearInstallerSession, type InstallerInfo } from './utils/installerSession'
import type { VisibleFields } from './types'
import NewReportForm from './components/NewReportForm'
import InstallerJobCards from './components/InstallerJobCards'
import InstallerReportsView from './components/InstallerReportsView'

const DEFAULT_VISIBLE_FIELDS: VisibleFields = { products: true, issues_solutions: true, photos: true }

function PinEntry({ onSignedIn }: { onSignedIn: (installer: InstallerInfo) => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!pin.trim()) return
    setLoading(true)
    setError('')
    try {
      const r = await axios.post('/api/install/pin-login', { pin })
      setInstallerSession(r.data.token, r.data.installer)
      onSignedIn(r.data.installer)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Incorrect PIN')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <img src="/Harrows_Logo2023_Icon_Charcoal_R_RGB.png" alt="Harrows" className="w-12 h-12 mb-4" />
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Harrows</h1>
      <p className="text-sm text-gray-400 mb-8">Enter your PIN to file a site report</p>
      <div className="w-full max-w-xs">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="PIN"
          className="w-full text-center text-2xl tracking-[0.5em] border border-gray-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-harrows-yellow/40"
        />
        {error && <p className="text-sm text-red-500 text-center mb-3">{error}</p>}
        <button onClick={submit} disabled={loading || !pin}
          className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {loading ? 'Checking...' : 'Continue'}
        </button>
      </div>
      <a href="/" className="mt-8 text-xs text-gray-400 hover:text-gray-600 transition-colors">Office staff? Sign in here &rarr;</a>
    </div>
  )
}

const TABS = ['New Report', 'Job Cards', 'My Reports'] as const
type Tab = typeof TABS[number]

export default function InstallerApp() {
  const [installer, setInstaller] = useState<InstallerInfo | null>(() => (getInstallerToken() ? getInstallerInfo() : null))
  const [tab, setTab] = useState<Tab>('New Report')
  const [visibleFields, setVisibleFields] = useState<VisibleFields>(DEFAULT_VISIBLE_FIELDS)
  const [defectsNoticeText, setDefectsNoticeText] = useState('')
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0)

  useEffect(() => {
    if (!installer) return
    axios.get('/api/install/report-form-config')
      .then(r => { setVisibleFields(r.data.visibleFields); setDefectsNoticeText(r.data.defectsNoticeText) })
      .catch(() => {})
  }, [installer])

  if (!installer) {
    return <PinEntry onSignedIn={setInstaller} />
  }

  const signOut = () => {
    clearInstallerSession()
    setInstaller(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1E293B] text-white sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold tracking-wide">HARROWS</p>
            <p className="text-xs text-gray-400">Signed in as {installer.name}</p>
          </div>
          <button onClick={signOut} className="text-xs text-gray-300 hover:text-white transition-colors">Sign out</button>
        </div>
        <nav className="px-4 flex gap-1 border-t border-white/10 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t ? 'border-harrows-yellow text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}>
              {t.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto">
        {tab === 'New Report' && (
          <NewReportForm
            installer={installer}
            visibleFields={visibleFields}
            defectsNoticeText={defectsNoticeText}
            onSubmitted={() => setReportsRefreshKey(k => k + 1)}
          />
        )}
        {tab === 'Job Cards' && <InstallerJobCards />}
        {tab === 'My Reports' && <InstallerReportsView refreshKey={reportsRefreshKey} />}
      </main>
    </div>
  )
}
