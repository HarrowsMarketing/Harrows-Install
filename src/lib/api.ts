import axios from 'axios'
import { getInstallerToken, clearInstallerSession } from '../utils/installerSession'

// A page renders either the admin shell (Clerk) or the installer PIN flow, never both,
// so one shared axios interceptor can pick whichever token is present — an installer
// token in localStorage takes priority since it only exists after a PIN login.
let installed = false

export function installApiAuth() {
  if (installed) return
  installed = true
  axios.interceptors.request.use(async config => {
    const url = config.url || ''
    if (!url.startsWith('/api')) return config
    const hdrs: any = config.headers ?? (config.headers = {} as any)
    if (hdrs.Authorization) return config
    const installerToken = getInstallerToken()
    if (installerToken) {
      hdrs.Authorization = `Bearer ${installerToken}`
      return config
    }
    try {
      const token = await (window as any).Clerk?.session?.getToken?.()
      if (token) hdrs.Authorization = `Bearer ${token}`
    } catch { /* no active Clerk session */ }
    return config
  })

  axios.interceptors.response.use(
    res => res,
    err => {
      if (err?.response?.status === 401 && getInstallerToken()) {
        // Installer session expired/invalid — drop it so the PIN screen reappears.
        clearInstallerSession()
      }
      return Promise.reject(err)
    }
  )
}
