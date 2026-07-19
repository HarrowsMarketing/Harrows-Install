const TOKEN_KEY = 'eod:installerToken'
const INFO_KEY = 'eod:installerInfo'

export interface InstallerInfo {
  id: string
  name: string
  role: 'installer' | 'team_leader'
  adminAccess: boolean
}

export function setInstallerSession(token: string, installer: InstallerInfo) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(INFO_KEY, JSON.stringify(installer))
}

export function getInstallerToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getInstallerInfo(): InstallerInfo | null {
  try {
    const raw = localStorage.getItem(INFO_KEY)
    return raw ? (JSON.parse(raw) as InstallerInfo) : null
  } catch { return null }
}

export function clearInstallerSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(INFO_KEY)
}
