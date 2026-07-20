import express from 'express'
import cors from 'cors'
import axios from 'axios'
import crypto from 'crypto'
import { list, issueSignedToken, presignUrl } from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'

const app = express()

// Same restriction pattern as the main Harrows-dashboard repo — same-origin browser
// traffic only, auth is Bearer-token based (Clerk JWT or installer PIN token), not cookies.
const ALLOWED_ORIGINS = new Set(['https://installs.harrows.co.nz', process.env.APP_ORIGIN].filter(Boolean))
app.use(cors({ origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)) }))
app.use(express.json({ limit: '10mb' }))

// ── Supabase (raw PostgREST via axios + service-role key, same pattern as Harrows-dashboard) ──

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const sbH = (extra = {}) => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
})
const sb = (table, qs = '') => `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`

async function getConfig(key, fallback) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return fallback
  try {
    const r = await axios.get(sb('eod_config', `key=eq.${encodeURIComponent(key)}&limit=1`), { headers: sbH() })
    if (r.data?.length > 0) return r.data[0].value
    return fallback
  } catch { return fallback }
}

async function setConfig(key, value, updatedBy = '') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase not configured')
  await axios.post(sb('eod_config'),
    { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }) }
  )
}

const isUuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

// ── Clerk auth (admin/office shell) — same verification pattern as Harrows-dashboard's ──
// requireDept(dept), reusing the same Clerk instance/keys so office staff use their
// existing Harrows-dashboard login (just need 'install' added to allowedDepts).

const CLERK_SECRET = process.env.CLERK_SECRET_KEY
const CLERK_API = 'https://api.clerk.com/v1'
const clerkH = () => ({ Authorization: `Bearer ${CLERK_SECRET}`, 'Content-Type': 'application/json' })

function requireDept(dept) {
  return async function (req, res, next) {
    if (!CLERK_SECRET) return res.status(503).json({ error: 'Auth not configured' })
    const raw = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!raw) return res.status(401).json({ error: 'Unauthorized' })
    try {
      const parts = raw.split('.')
      if (parts.length !== 3) return res.status(401).json({ error: 'Invalid token' })
      const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
      const [sessionRes, userRes] = await Promise.all([
        axios.get(`${CLERK_API}/sessions/${claims.sid}`, { headers: clerkH() }),
        axios.get(`${CLERK_API}/users/${claims.sub}`, { headers: clerkH() }),
      ])
      if (sessionRes.data.status !== 'active') return res.status(401).json({ error: 'Session expired' })
      if (sessionRes.data.user_id !== claims.sub) return res.status(401).json({ error: 'Token mismatch' })
      const meta = userRes.data.public_metadata ?? {}
      const isAdminRole = meta.role === 'admin' || meta.role === 'super_admin'
      if (!isAdminRole && !(meta.allowedDepts ?? []).includes(dept)) return res.status(403).json({ error: 'Forbidden' })
      if ((meta.blockedDepts ?? []).includes(dept)) return res.status(403).json({ error: 'Forbidden' })
      req.clerkUser = userRes.data
      req.clerkUserId = claims.sub
      next()
    } catch (e) {
      console.error(`${dept} auth error`, e.message)
      res.status(401).json({ error: 'Invalid session' })
    }
  }
}

const requireAdmin = requireDept('install')

// ── Installer PIN auth — no Clerk account, a short-lived HMAC-signed session token ──
// minted on PIN login and carried by the installer's phone in localStorage. Distinct
// from a Clerk JWT (3 dot-separated parts) by having exactly 2 parts: payload.signature.

const INSTALLER_SESSION_SECRET = process.env.INSTALLER_SESSION_SECRET
const INSTALLER_SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12h — a single work day

function signInstallerToken(installer) {
  const payload = {
    id: installer.id,
    name: installer.name,
    adminAccess: !!installer.admin_access,
    exp: Date.now() + INSTALLER_SESSION_TTL_MS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', INSTALLER_SESSION_SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyInstallerToken(raw) {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = crypto.createHmac('sha256', INSTALLER_SESSION_SECRET).update(body).digest('base64url')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

async function requireInstallerSession(req, res, next) {
  if (!INSTALLER_SESSION_SECRET) return res.status(503).json({ error: 'Auth not configured' })
  const raw = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const payload = verifyInstallerToken(raw)
  if (!payload) return res.status(401).json({ error: 'Invalid or expired session' })
  req.installer = payload
  next()
}

// Some routes (Job Cards search/add) are usable from either the admin shell or the
// installer PIN flow — try an installer token first, then fall back to the Clerk gate.
function requireInstallerOrAdmin(req, res, next) {
  const raw = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const payload = verifyInstallerToken(raw)
  if (payload) { req.installer = payload; return next() }
  return requireAdmin(req, res, next)
}

// ── Sign-in log ────────────────────────────────────────────────────────────────

async function logSignin(installer) {
  try {
    await axios.post(sb('eod_signin_log'), {
      installer_id: installer.id,
      installer_name: installer.name,
    }, { headers: sbH() })
  } catch (e) {
    console.error('signin log error', e.message)
  }
}

// ── Installer PIN login ─────────────────────────────────────────────────────────

app.post('/api/install/pin-login', async (req, res) => {
  try {
    const pin = String(req.body?.pin || '').trim()
    if (!pin) return res.status(400).json({ error: 'PIN required' })
    const r = await axios.get(sb('installers', `pin=eq.${encodeURIComponent(pin)}&limit=1`), { headers: sbH() })
    const installer = r.data?.[0]
    if (!installer) return res.status(401).json({ error: 'Incorrect PIN' })
    const token = signInstallerToken(installer)
    await logSignin(installer)
    res.json({ token, installer: { id: installer.id, name: installer.name, role: installer.role, adminAccess: installer.admin_access } })
  } catch (e) {
    console.error('pin-login error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Job Cards ────────────────────────────────────────────────────────────────

app.get('/api/install/jobs', requireInstallerOrAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim()
    let qs = 'order=created_at.desc&limit=200'
    if (search) {
      const like = encodeURIComponent(`%${search}%`)
      qs += `&or=(job_number.ilike.${like},project_name.ilike.${like},address.ilike.${like})`
    }
    const r = await axios.get(sb('job_cards', qs), { headers: sbH() })
    res.json({ jobs: r.data })
  } catch (e) {
    console.error('jobs list error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/install/jobs', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { jobNumber, projectName, address } = req.body || {}
    if (!jobNumber || !projectName) return res.status(400).json({ error: 'jobNumber and projectName are required' })
    const createdBy = req.installer?.name || req.clerkUser?.id || null
    const r = await axios.post(sb('job_cards'), {
      job_number: jobNumber, project_name: projectName, address: address || null, created_by: createdBy,
    }, { headers: sbH({ Prefer: 'return=representation' }) })
    res.json({ job: r.data[0] })
  } catch (e) {
    console.error('jobs create error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/jobs/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const { jobNumber, projectName, address } = req.body || {}
    const patch = {}
    if (jobNumber !== undefined) patch.job_number = jobNumber
    if (projectName !== undefined) patch.project_name = projectName
    if (address !== undefined) patch.address = address
    await axios.patch(sb('job_cards', `id=eq.${req.params.id}`), patch, { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('jobs update error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/install/jobs/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    await axios.delete(sb('job_cards', `id=eq.${req.params.id}`), { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('jobs delete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── People (installer roster) — admin only ──────────────────────────────────────

app.get('/api/install/people', requireAdmin, async (req, res) => {
  try {
    const r = await axios.get(sb('installers', 'order=name.asc'), { headers: sbH() })
    res.json({ people: r.data })
  } catch (e) {
    console.error('people list error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/install/people', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, pin, role, adminAccess } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' })
    const r = await axios.post(sb('installers'), {
      name, email: email || null, phone: phone || null, pin: String(pin),
      role: role === 'team_leader' ? 'team_leader' : 'installer',
      admin_access: !!adminAccess,
    }, { headers: sbH({ Prefer: 'return=representation' }) })
    res.json({ person: r.data[0] })
  } catch (e) {
    console.error('people create error', e.message)
    res.status(e.response?.status === 409 ? 409 : 500).json({ error: e.response?.status === 409 ? 'That PIN is already in use' : e.message })
  }
})

app.patch('/api/install/people/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const { name, email, phone, pin, role, adminAccess } = req.body || {}
    const patch = {}
    if (name !== undefined) patch.name = name
    if (email !== undefined) patch.email = email
    if (phone !== undefined) patch.phone = phone
    if (pin !== undefined) patch.pin = String(pin)
    if (role !== undefined) patch.role = role === 'team_leader' ? 'team_leader' : 'installer'
    if (adminAccess !== undefined) patch.admin_access = !!adminAccess
    await axios.patch(sb('installers', `id=eq.${req.params.id}`), patch, { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('people update error', e.message)
    res.status(e.response?.status === 409 ? 409 : 500).json({ error: e.response?.status === 409 ? 'That PIN is already in use' : e.message })
  }
})

app.delete('/api/install/people/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    await axios.delete(sb('installers', `id=eq.${req.params.id}`), { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('people delete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Reports ──────────────────────────────────────────────────────────────────

const REPORT_SELECT = 'select=*,job:job_cards(id,job_number,project_name,address),installer:installers(id,name),photos:eod_report_photos(id,blob_pathname)'

app.get('/api/install/reports', requireInstallerOrAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim()
    let qs = `${REPORT_SELECT}&order=report_date.desc,created_at.desc&limit=500`
    // A plain installer session only sees their own reports; the office/admin shell
    // (Clerk) always sees everything, and an installer flagged admin_access also sees
    // everything even through the PIN flow (mirrors the People tab's ADMIN ACCESS badge).
    if (req.installer && !req.installer.adminAccess) qs += `&installer_id=eq.${req.installer.id}`
    const r = await axios.get(sb('eod_reports', qs), { headers: sbH() })
    let reports = r.data
    if (search) {
      const s = search.toLowerCase()
      reports = reports.filter(rep =>
        rep.job?.job_number?.toLowerCase().includes(s) ||
        rep.job?.project_name?.toLowerCase().includes(s) ||
        rep.installer?.name?.toLowerCase().includes(s)
      )
    }
    res.json({ reports })
  } catch (e) {
    console.error('reports list error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/install/reports/:id', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const r = await axios.get(sb('eod_reports', `${REPORT_SELECT}&id=eq.${req.params.id}&limit=1`), { headers: sbH() })
    const report = r.data?.[0]
    if (!report) return res.status(404).json({ error: 'Not found' })
    if (req.installer && !req.installer.adminAccess && report.installer_id !== req.installer.id) return res.status(403).json({ error: 'Forbidden' })
    res.json({ report })
  } catch (e) {
    console.error('report get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/install/reports', requireInstallerOrAdmin, async (req, res) => {
  try {
    const {
      jobId, installerId, reportDate, percentComplete, workDone, workScheduledTomorrow,
      products, issues, solutions, additionalNotes, photoPathnames,
    } = req.body || {}
    if (!reportDate || !workDone) return res.status(400).json({ error: 'reportDate and workDone are required' })
    // An installer session always files under their own identity, ignoring any client-supplied installerId.
    const finalInstallerId = req.installer ? req.installer.id : installerId
    if (!finalInstallerId) return res.status(400).json({ error: 'installerId is required' })

    const r = await axios.post(sb('eod_reports'), {
      job_id: jobId || null,
      installer_id: finalInstallerId,
      report_date: reportDate,
      percent_complete: percentComplete ?? 0,
      work_done: workDone,
      work_scheduled_tomorrow: workScheduledTomorrow || null,
      products: products || null,
      issues: issues || null,
      solutions: solutions || null,
      additional_notes: additionalNotes || null,
    }, { headers: sbH({ Prefer: 'return=representation' }) })
    const report = r.data[0]

    if (Array.isArray(photoPathnames) && photoPathnames.length) {
      await axios.post(sb('eod_report_photos'),
        photoPathnames.map(p => ({ report_id: report.id, blob_pathname: p })),
        { headers: sbH() }
      )
    }

    res.json({ report })
  } catch (e) {
    console.error('report create error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/reports/:id/mark-emailed', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    await axios.patch(sb('eod_reports', `id=eq.${req.params.id}`), {
      email_sent: true, email_sent_at: new Date().toISOString(),
    }, { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('mark-emailed error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/install/reports/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    await axios.delete(sb('eod_reports', `id=eq.${req.params.id}`), { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('report delete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Photos (client-direct-to-Blob upload, same pattern as newsletter upload) ────

app.post('/api/install/photos/upload-token', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { type, payload } = req.body || {}
    if (type === 'blob.generate-client-token') {
      const { pathname } = payload || {}
      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname,
        // jpeg/png/webp only — HEIC (iPhone's default camera format) can't be drawn into
        // a <canvas>/jsPDF image without a server-side transcode step, so it's excluded
        // here; the browser file input's `capture` attribute still yields JPEG in practice.
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        addRandomSuffix: true,
        validUntil: Date.now() + 30 * 60 * 1000,
      })
      return res.json({ type, clientToken })
    }
    return res.json({ type, response: 'ok' })
  } catch (e) {
    console.error('photos upload-token error', e.message)
    res.status(400).json({ error: e.message })
  }
})

// Private blobs need a signed read URL — used both for displaying photos in the
// Library/report view and for embedding them client-side into the exported PDF.
app.get('/api/install/photos/url', requireInstallerOrAdmin, async (req, res) => {
  try {
    const pathname = String(req.query.pathname || '')
    if (!pathname.startsWith('install/')) return res.status(400).json({ error: 'Invalid pathname' })
    const signedToken = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + 60 * 60 * 1000 })
    const { presignedUrl } = await presignUrl(signedToken, { pathname, operation: 'get', access: 'private' })
    res.json({ url: presignedUrl })
  } catch (e) {
    console.error('photos url error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Settings (admin only) ────────────────────────────────────────────────────

const DEFAULT_VISIBLE_FIELDS = { products: true, issues_solutions: true, photos: true }

app.get('/api/install/config', requireAdmin, async (req, res) => {
  try {
    const [internalCcAddress, emailSignoff, defectsNoticeText, defaultInstallerId, visibleFields] = await Promise.all([
      getConfig('internal_cc_address', ''),
      getConfig('email_signoff', 'Harrows Install Team'),
      getConfig('defects_notice_text', 'Should you encounter any defects, damages or items that need addressing, please let us know within 2 working days following the issue of this report.'),
      getConfig('default_installer_id', null),
      getConfig('visible_fields', DEFAULT_VISIBLE_FIELDS),
    ])
    res.json({ internalCcAddress, emailSignoff, defectsNoticeText, defaultInstallerId, visibleFields })
  } catch (e) {
    console.error('config get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/config', requireAdmin, async (req, res) => {
  try {
    const { internalCcAddress, emailSignoff, defectsNoticeText, defaultInstallerId, visibleFields } = req.body || {}
    const updatedBy = req.clerkUser?.id || ''
    await Promise.all([
      internalCcAddress !== undefined ? setConfig('internal_cc_address', internalCcAddress, updatedBy) : null,
      emailSignoff !== undefined ? setConfig('email_signoff', emailSignoff, updatedBy) : null,
      defectsNoticeText !== undefined ? setConfig('defects_notice_text', defectsNoticeText, updatedBy) : null,
      defaultInstallerId !== undefined ? setConfig('default_installer_id', defaultInstallerId, updatedBy) : null,
      visibleFields !== undefined ? setConfig('visible_fields', { ...DEFAULT_VISIBLE_FIELDS, ...visibleFields }, updatedBy) : null,
    ].filter(Boolean))
    res.json({ ok: true })
  } catch (e) {
    console.error('config update error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// A stripped-down, unauthenticated read of just the report-form-relevant config —
// the installer PIN flow needs visibleFields/defectsNoticeText before it has any
// session at all context, but shouldn't be able to read/change CC address etc.
// (still requires a valid installer session, just not admin).
app.get('/api/install/report-form-config', requireInstallerSession, async (req, res) => {
  try {
    const [defectsNoticeText, visibleFields] = await Promise.all([
      getConfig('defects_notice_text', ''),
      getConfig('visible_fields', DEFAULT_VISIBLE_FIELDS),
    ])
    res.json({ defectsNoticeText, visibleFields })
  } catch (e) {
    console.error('report-form-config error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Activity (sign-in log, admin only) ──────────────────────────────────────────

app.get('/api/install/signin-log', requireAdmin, async (req, res) => {
  try {
    const r = await axios.get(sb('eod_signin_log', 'order=signed_in_at.desc&limit=500'), { headers: sbH() })
    res.json({ log: r.data })
  } catch (e) {
    console.error('signin-log error', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default app
