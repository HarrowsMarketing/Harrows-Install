import express from 'express'
import cors from 'cors'
import axios from 'axios'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
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
const isValidPin = s => typeof s === 'string' && /^\d{6}$/.test(s)
const isValidEmail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// ── Report notification emails (admin-configured recipients, not the client) ──────

// Sent via Microsoft Graph (app-only), not SMTP. Legacy SMTP AUTH with a
// personal account/password doesn't work on this tenant — Conditional Access
// blocks basic auth outright, independent of any per-mailbox "Authenticated
// SMTP" setting (found 2026-09-07 chasing repeated 535 5.7.139 errors). Graph's
// app-only sendMail uses OAuth2 client-credentials instead, which Conditional
// Access policies targeting legacy auth don't touch, and sends genuinely as
// reporting@harrows.co.nz itself — no personal account/password involved, so
// nobody leaving or changing their password can break this again. Same
// MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET Azure AD app registration pattern
// as harrows-dashboard's api/sales/daily-email.js (reuse the same app rather
// than creating a second one) — it needs the Mail.Send application permission
// (admin-consented), ideally restricted via an Exchange Online Application
// Access Policy to only reporting@harrows.co.nz, since app-only Mail.Send
// otherwise permits sending as any mailbox in the tenant.
let _graphToken = { value: null, exp: 0 }
async function getGraphToken() {
  const tenant = process.env.MS_TENANT_ID, clientId = process.env.MS_CLIENT_ID, secret = process.env.MS_CLIENT_SECRET
  if (!tenant || !clientId || !secret) throw new Error('Microsoft Graph not configured')
  if (_graphToken.value && Date.now() < _graphToken.exp - 60000) return _graphToken.value
  const body = new URLSearchParams({
    client_id: clientId, client_secret: secret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  })
  const r = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  _graphToken = { value: r.data.access_token, exp: Date.now() + (r.data.expires_in || 3600) * 1000 }
  return _graphToken.value
}

// EMAIL_FROM is still "Display Name <address>" — extract just the address,
// since Graph sends as whichever mailbox the URL targets (no per-message
// display-name override; that comes from the mailbox's own Entra ID config).
function extractSenderAddress() {
  const raw = process.env.EMAIL_FROM || ''
  const m = /<([^>]+)>/.exec(raw)
  return (m ? m[1] : raw).trim() || 'reporting@harrows.co.nz'
}

async function sendGraphMail({ to, subject, html }) {
  const token = await getGraphToken()
  const sender = extractSenderAddress()
  const toRecipients = to.split(',').map(s => s.trim()).filter(Boolean)
    .map(address => ({ emailAddress: { address } }))
  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    { message: { subject, body: { contentType: 'HTML', content: html }, toRecipients }, saveToSentItems: false },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )
}

// Fires immediately after a report is filed, to whoever's configured in Settings plus
// any Clerk admin who's individually opted in — never to every admin/installer by
// default. Failure here must never fail the report submission itself, so callers wrap
// this in try/catch (same defensive pattern as logSignin).
async function sendReportNotification(report) {
  const [manual, optIns] = await Promise.all([
    getConfig('notification_recipients', []),
    getConfig('admin_notification_optins', {}),
  ])
  const manualEmails = (manual || []).map(r => r.email)
  const optInEmails = Object.values(optIns || {}).filter(o => o?.enabled).map(o => o.email)
  const emails = [...new Set([...manualEmails, ...optInEmails])].filter(isValidEmail)
  if (!emails.length) return
  const dateLabel = new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const jobLabel = report.job ? `Job ${report.job.job_number} — ${report.job.project_name}` : 'No job selected'
  const html = `
    <p><strong>${jobLabel}</strong></p>
    <p>${dateLabel} · ${report.installer?.name || 'Unknown installer'} · ${report.percent_complete}% complete</p>
    <p style="white-space: pre-wrap;">${report.work_done}</p>
    <p><a href="https://installs.harrows.co.nz/admin">View in Harrows Install</a></p>
  `
  await sendGraphMail({
    to: emails.join(', '),
    subject: `New install report — ${jobLabel}`,
    html,
  })
}

// ── Job card scan (Claude vision extraction) ──────────────────────────────────

const anthropic = new Anthropic()

const JOB_CARD_FIELDS = [
  'jobNumber', 'projectName', 'address',
  'billingCompany', 'invoiceTo', 'invoicePhone', 'invoiceEmail',
  'pmName', 'pmPhone', 'pmEmail',
  'salespersonName', 'salespersonEmail',
]

const JOB_CARD_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(JOB_CARD_FIELDS.map(f => [f, { type: 'string' }])),
  required: JOB_CARD_FIELDS,
  additionalProperties: false,
}

// ── Clerk auth (admin/office shell) — same verification pattern as Harrows-dashboard's ──
// Any office staff member with an active Clerk login (the same shared instance as
// Harrows-dashboard) can access the Install app's admin/office shell — no per-dept
// allowedDepts gate. Access here isn't managed from Harrows-dashboard's /admin at all.

const CLERK_SECRET = process.env.CLERK_SECRET_KEY
const CLERK_API = 'https://api.clerk.com/v1'
const clerkH = () => ({ Authorization: `Bearer ${CLERK_SECRET}`, 'Content-Type': 'application/json' })

async function requireAdmin(req, res, next) {
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
    req.clerkUser = userRes.data
    req.clerkUserId = claims.sub
    next()
  } catch (e) {
    console.error('admin auth error', e.message)
    res.status(401).json({ error: 'Invalid session' })
  }
}

function clerkDisplayName(user) {
  if (!user) return null
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return name || user.email_addresses?.[0]?.email_address || null
}

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
    res.json({ token, installer: {
      id: installer.id, name: installer.name, role: installer.role, adminAccess: installer.admin_access,
      phone: installer.phone, photoPathname: installer.photo_pathname,
    } })
  } catch (e) {
    console.error('pin-login error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Installer self-service profile — name/phone/photo only, no PIN/role/admin_access ──
// (those stay admin-only via /api/install/people/:id). Any installer session can edit
// their own record this way, regardless of admin_access.

app.get('/api/install/me', requireInstallerSession, async (req, res) => {
  try {
    const r = await axios.get(sb('installers', `id=eq.${req.installer.id}&limit=1`), { headers: sbH() })
    const installer = r.data?.[0]
    if (!installer) return res.status(404).json({ error: 'Not found' })
    res.json({ installer })
  } catch (e) {
    console.error('me get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/me', requireInstallerSession, async (req, res) => {
  try {
    const { name, phone, photoPathname } = req.body || {}
    const patch = {}
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name is required' })
      patch.name = String(name).trim()
    }
    if (phone !== undefined) patch.phone = phone || null
    if (photoPathname !== undefined) patch.photo_pathname = photoPathname || null
    await axios.patch(sb('installers', `id=eq.${req.installer.id}`), patch, { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('me update error', e.message)
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

// Scans an uploaded photo/PDF of a physical job card and extracts fields to pre-fill
// the add/edit form — the user still reviews and saves, nothing is written here.
app.post('/api/install/jobs/scan', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { mediaType, data } = req.body || {}
    if (!mediaType || !data) return res.status(400).json({ error: 'mediaType and data are required' })
    const isPdf = mediaType === 'application/pdf'
    if (!isPdf && !mediaType.startsWith('image/')) {
      return res.status(400).json({ error: 'mediaType must be an image/* type or application/pdf' })
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: JOB_CARD_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          {
            type: isPdf ? 'document' : 'image',
            source: { type: 'base64', media_type: mediaType, data },
          },
          {
            type: 'text',
            text: 'This is a job card document for a furniture install job. Read the entire document carefully before answering, including small or lower-contrast printed text, tables, stamps, and handwritten annotations — not just the largest or boldest text on the page. Extract: job number, project name, site address, billing company name, invoice-to contact name, invoice-to phone, invoice-to email, project manager name, project manager phone, project manager email, salesperson name, salesperson email. Only use an empty string for a field after you have checked the whole document and it is genuinely not present — do not leave a field empty just because it is small or easy to miss.',
          },
        ],
      }],
    })

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Could not read this document' })
    }
    const textBlock = response.content.find(b => b.type === 'text')
    const fields = JSON.parse(textBlock?.text || '{}')
    res.json({ fields })
  } catch (e) {
    console.error('job card scan error', e.message)
    if (e instanceof Anthropic.BadRequestError) {
      return res.status(400).json({ error: 'Could not read this file — try a clearer photo' })
    }
    res.status(500).json({ error: 'Scan failed, please enter details manually' })
  }
})

// camelCase (frontend/API) -> snake_case (db column) for the optional job card detail fields
const JOB_CARD_DETAIL_COLUMNS = {
  billingCompany: 'billing_company',
  invoiceTo: 'invoice_to',
  invoicePhone: 'invoice_phone',
  invoiceEmail: 'invoice_email',
  pmName: 'pm_name',
  pmPhone: 'pm_phone',
  pmEmail: 'pm_email',
  salespersonName: 'salesperson_name',
  salespersonEmail: 'salesperson_email',
}

app.post('/api/install/jobs', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { jobNumber, projectName, address } = req.body || {}
    if (!jobNumber || !projectName) return res.status(400).json({ error: 'jobNumber and projectName are required' })
    const createdBy = req.installer?.name || clerkDisplayName(req.clerkUser) || null
    const detail = {}
    for (const [camel, column] of Object.entries(JOB_CARD_DETAIL_COLUMNS)) {
      detail[column] = req.body[camel] || null
    }
    const r = await axios.post(sb('job_cards'), {
      job_number: jobNumber, project_name: projectName, address: address || null, created_by: createdBy, ...detail,
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
    for (const [camel, column] of Object.entries(JOB_CARD_DETAIL_COLUMNS)) {
      if (req.body[camel] !== undefined) patch[column] = req.body[camel] || null
    }
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
    const { name, email, phone, pin, role, adminAccess, photoPathname } = req.body || {}
    if (!name || !pin) return res.status(400).json({ error: 'name and pin are required' })
    if (!isValidPin(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 6 digits' })
    const r = await axios.post(sb('installers'), {
      name, email: email || null, phone: phone || null, pin: String(pin),
      role: role === 'team_leader' ? 'team_leader' : 'installer',
      admin_access: !!adminAccess,
      photo_pathname: photoPathname || null,
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
    const { name, email, phone, pin, role, adminAccess, photoPathname } = req.body || {}
    const patch = {}
    if (name !== undefined) patch.name = name
    if (email !== undefined) patch.email = email
    if (phone !== undefined) patch.phone = phone
    if (pin !== undefined) {
      if (!isValidPin(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 6 digits' })
      patch.pin = String(pin)
    }
    if (role !== undefined) patch.role = role === 'team_leader' ? 'team_leader' : 'installer'
    if (adminAccess !== undefined) patch.admin_access = !!adminAccess
    if (photoPathname !== undefined) patch.photo_pathname = photoPathname
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

const REPORT_SELECT = 'select=*,job:job_cards(id,job_number,project_name,address),installer:installers(id,name,photo_pathname),photos:eod_report_photos(id,blob_pathname,is_internal)'

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
    // e.message from axios is just "Request failed with status code 400" — the actual
    // reason (e.g. Supabase's PostgREST rejecting the query) is in e.response.data.
    console.error('reports list error', JSON.stringify(e.response?.data) || e.message)
    res.status(500).json({ error: e.response?.data?.message || e.message })
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
      internalNotes, internalPhotoPathnames,
    } = req.body || {}
    if (!reportDate || !workDone) return res.status(400).json({ error: 'reportDate and workDone are required' })
    // An installer session always files under their own identity, ignoring any client-supplied installerId.
    const finalInstallerId = req.installer ? req.installer.id : installerId
    if (!finalInstallerId) return res.status(400).json({ error: 'installerId is required' })

    // Photos are compulsory whenever the photos field itself is enabled — if an admin's
    // turned the field off entirely via Settings, there's nothing to require.
    const visibleFields = await getConfig('visible_fields', DEFAULT_VISIBLE_FIELDS)
    if (visibleFields.photos && !(Array.isArray(photoPathnames) && photoPathnames.length)) {
      return res.status(400).json({ error: 'At least one photo is required' })
    }

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
      internal_notes: internalNotes || null,
    }, { headers: sbH({ Prefer: 'return=representation' }) })
    const report = r.data[0]

    const photoRows = [
      ...(Array.isArray(photoPathnames) ? photoPathnames.map(p => ({ report_id: report.id, blob_pathname: p, is_internal: false })) : []),
      ...(Array.isArray(internalPhotoPathnames) ? internalPhotoPathnames.map(p => ({ report_id: report.id, blob_pathname: p, is_internal: true })) : []),
    ]
    if (photoRows.length) {
      await axios.post(sb('eod_report_photos'), photoRows, { headers: sbH() })
    }

    const fullReport = (await axios.get(sb('eod_reports', `${REPORT_SELECT}&id=eq.${report.id}&limit=1`), { headers: sbH() })).data?.[0] || report
    try {
      await sendReportNotification(fullReport)
    } catch (e) {
      console.error('report notification error', e.message)
    }

    res.json({ report: fullReport })
  } catch (e) {
    console.error('report create error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Edit a report already on file. An installer session may only edit their own report;
// a Clerk admin may edit any. A processed (email_sent) report can no longer be edited
// at all — the client has already received it, so changing it after the fact would go
// unnoticed rather than triggering a re-check.
app.patch('/api/install/reports/:id', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const existingRes = await axios.get(sb('eod_reports', `id=eq.${req.params.id}&limit=1`), { headers: sbH() })
    const current = existingRes.data?.[0]
    if (!current) return res.status(404).json({ error: 'Not found' })
    if (req.installer && current.installer_id !== req.installer.id) return res.status(403).json({ error: 'Forbidden' })
    if (current.email_sent) return res.status(403).json({ error: 'This report has already been processed and can no longer be edited.' })

    const {
      jobId, installerId, reportDate, percentComplete, workDone, workScheduledTomorrow,
      products, issues, solutions, additionalNotes, photoPathnames,
      internalNotes, internalPhotoPathnames,
    } = req.body || {}
    if (!reportDate || !workDone) return res.status(400).json({ error: 'reportDate and workDone are required' })

    const visibleFields = await getConfig('visible_fields', DEFAULT_VISIBLE_FIELDS)
    if (visibleFields.photos && !(Array.isArray(photoPathnames) && photoPathnames.length)) {
      return res.status(400).json({ error: 'At least one photo is required' })
    }

    const patch = {
      job_id: jobId || null,
      report_date: reportDate,
      percent_complete: percentComplete ?? 0,
      work_done: workDone,
      work_scheduled_tomorrow: workScheduledTomorrow || null,
      products: products || null,
      issues: issues || null,
      solutions: solutions || null,
      additional_notes: additionalNotes || null,
      internal_notes: internalNotes || null,
    }
    // Only a Clerk admin (never a PIN session) may reassign who a report is filed under.
    if (!req.installer && installerId) patch.installer_id = installerId
    await axios.patch(sb('eod_reports', `id=eq.${req.params.id}`), patch, { headers: sbH() })

    // Reconcile photos against the submitted final lists, split by is_internal — delete
    // rows for pathnames no longer present, insert rows for newly added ones.
    const photosRes = await axios.get(sb('eod_report_photos', `report_id=eq.${req.params.id}`), { headers: sbH() })
    const existingPhotos = photosRes.data || []
    const reconcilePhotos = async (submitted, isInternal) => {
      const wanted = new Set(Array.isArray(submitted) ? submitted : [])
      const currentRows = existingPhotos.filter(p => p.is_internal === isInternal)
      const toDelete = currentRows.filter(p => !wanted.has(p.blob_pathname))
      const currentPathnames = new Set(currentRows.map(p => p.blob_pathname))
      const toInsert = [...wanted].filter(p => !currentPathnames.has(p))
      if (toDelete.length) {
        await axios.delete(sb('eod_report_photos', `id=in.(${toDelete.map(p => p.id).join(',')})`), { headers: sbH() })
      }
      if (toInsert.length) {
        await axios.post(sb('eod_report_photos'),
          toInsert.map(p => ({ report_id: req.params.id, blob_pathname: p, is_internal: isInternal })),
          { headers: sbH() })
      }
    }
    await reconcilePhotos(photoPathnames, false)
    await reconcilePhotos(internalPhotoPathnames, true)

    const r = await axios.get(sb('eod_reports', `${REPORT_SELECT}&id=eq.${req.params.id}&limit=1`), { headers: sbH() })
    res.json({ report: r.data[0] })
  } catch (e) {
    console.error('report update error', e.message)
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
    const [defectsNoticeText, defaultInstallerId, visibleFields, notificationRecipients] = await Promise.all([
      getConfig('defects_notice_text', 'Should you encounter any defects, damages or items that need addressing, please let us know within 2 working days following the issue of this report.'),
      getConfig('default_installer_id', null),
      getConfig('visible_fields', DEFAULT_VISIBLE_FIELDS),
      getConfig('notification_recipients', []),
    ])
    res.json({ defectsNoticeText, defaultInstallerId, visibleFields, notificationRecipients })
  } catch (e) {
    console.error('config get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/config', requireAdmin, async (req, res) => {
  try {
    const { defectsNoticeText, defaultInstallerId, visibleFields, notificationRecipients } = req.body || {}
    if (notificationRecipients !== undefined) {
      if (!Array.isArray(notificationRecipients)) {
        return res.status(400).json({ error: `notificationRecipients was not an array: ${JSON.stringify(notificationRecipients)}` })
      }
      const bad = notificationRecipients.filter(r => !r?.name?.trim() || !isValidEmail(r?.email))
      if (bad.length > 0) {
        return res.status(400).json({ error: `Invalid recipient(s): ${JSON.stringify(bad)}` })
      }
    }
    const updatedBy = req.clerkUser?.id || ''
    await Promise.all([
      defectsNoticeText !== undefined ? setConfig('defects_notice_text', defectsNoticeText, updatedBy) : null,
      defaultInstallerId !== undefined ? setConfig('default_installer_id', defaultInstallerId, updatedBy) : null,
      visibleFields !== undefined ? setConfig('visible_fields', { ...DEFAULT_VISIBLE_FIELDS, ...visibleFields }, updatedBy) : null,
      notificationRecipients !== undefined ? setConfig('notification_recipients', notificationRecipients, updatedBy) : null,
    ].filter(Boolean))
    res.json({ ok: true })
  } catch (e) {
    console.error('config update error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Each Clerk admin's own opt-in for report-submission emails — distinct from the shared
// `notification_recipients` list in Settings, which any admin can edit for anyone. This is
// self-service and defaults to off: an admin has to open this and tick it themselves.
app.get('/api/install/my-notification-pref', requireAdmin, async (req, res) => {
  try {
    const optIns = await getConfig('admin_notification_optins', {})
    res.json({ enabled: !!optIns[req.clerkUserId]?.enabled })
  } catch (e) {
    console.error('my-notification-pref get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/my-notification-pref', requireAdmin, async (req, res) => {
  try {
    const enabled = !!req.body?.enabled
    const optIns = await getConfig('admin_notification_optins', {})
    optIns[req.clerkUserId] = {
      name: clerkDisplayName(req.clerkUser) || '',
      email: req.clerkUser?.email_addresses?.[0]?.email_address || '',
      enabled,
      updatedAt: new Date().toISOString(),
    }
    await setConfig('admin_notification_optins', optIns, req.clerkUserId)
    res.json({ ok: true, enabled })
  } catch (e) {
    console.error('my-notification-pref update error', e.message)
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

// ── Returns — furniture coming back to the Timaru factory ─────────────────────
// Usable from both shells (office Clerk session or installer PIN session). A return
// is created with only job info + reason; every other section is filled in later,
// by whoever does that step, via PATCH. Status derives from what's been filled in
// (see computeReturnStatus) unless someone overrides it manually.

const RETURN_REASONS = ['Freight damage', 'Site damage', 'Manufacturing issue', 'Incorrect item', 'Warranty', 'Loan gear', 'Other']
const RETURN_ACTIONS = ['Repair', 'Replace', 'Rework', 'Inspect', 'Return to stock', 'Dispose', 'Other']
const RETURN_PRIORITIES = ['urgent', 'high', 'normal']
const RETURN_STATUSES = ['logged', 'freight_booked', 'in_transit', 'received', 'completed']
const RETURN_STATUS_LABELS = { logged: 'Logged', freight_booked: 'Freight booked', in_transit: 'In transit', received: 'Received at factory', completed: 'Completed' }
const RETURN_EVENTS = ['new_return', 'freight_booked', 'overdue', 'received', 'completed', 'urgent_logged']
const DEFAULT_RETURNS_STAFF = ['Matt', 'Ollie', 'Fletcher', 'Taryn']
const RETURNS_APP_URL = 'https://installs.harrows.co.nz'

// Text/date columns a client may write directly (snake_case, same names as the DB).
const RETURN_TEXT_FIELDS = [
  'original_job_number', 'original_job_name', 'site_address', 'new_so_number',
  'issue_description', 'requested_by', 'freight_company', 'freight_docket', 'pickup_location',
  'received_by', 'factory_location', 'arrival_damage', 'responsible_person',
]
const RETURN_DATE_FIELDS = ['required_by', 'expected_pickup_date', 'estimated_arrival_date', 'date_received']
// Field list and embedded-resource order are kept separate on purpose: anything appended to the
// select must go after the fields, never after `photos.order=…` (a join appended there lands inside
// the order value and PostgREST 400s with "failed to parse order").
const RETURN_SELECT_FIELDS = '*,job:job_cards(id,job_number,project_name,address),photos:return_photos(id,blob_pathname,kind,created_at)'
const RETURN_SELECT = `select=${RETURN_SELECT_FIELDS}&photos.order=created_at.asc`
const RETURN_SELECT_WITH_ACTIVITY = `select=${RETURN_SELECT_FIELDS},activity:return_activity(id,actor,action,changes,created_at)&photos.order=created_at.asc&activity.order=created_at.desc`

// Dates in this app are NZ calendar days (the factory is in Timaru), not UTC.
const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
const isIsoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

function computeReturnStatus(row) {
  if (row.completed_at) return 'completed'
  if (row.date_received) return 'received'
  if (row.expected_pickup_date && row.expected_pickup_date <= nzToday()) return 'in_transit'
  if (row.freight_company || row.freight_docket) return 'freight_booked'
  return 'logged'
}
const effectiveReturnStatus = row => row.completed_at ? 'completed' : (row.status_manual && row.status ? row.status : computeReturnStatus(row))
const isReturnOverdue = row => !row.completed_at && !row.date_received && !!row.estimated_arrival_date && row.estimated_arrival_date < nzToday()

// One wildcard read token per instance, presigned locally per photo — a per-photo
// issueSignedToken() round trip for every thumbnail on the list would be far too slow.
let _blobReadToken = { token: null, exp: 0 }
async function blobReadToken() {
  if (_blobReadToken.token && Date.now() < _blobReadToken.exp - 5 * 60 * 1000) return _blobReadToken.token
  const validUntil = Date.now() + 60 * 60 * 1000
  const token = await issueSignedToken({ operations: ['get'], validUntil })
  _blobReadToken = { token, exp: validUntil }
  return token
}
async function signedPhotoUrl(pathname) {
  try {
    const { presignedUrl } = await presignUrl(await blobReadToken(), { pathname, operation: 'get', access: 'private' })
    return presignedUrl
  } catch (e) {
    console.error('photo presign error', e.message)
    return null // the client falls back to /api/install/photos/url per photo
  }
}

async function decorateReturn(row) {
  const photos = await Promise.all((row.photos || []).map(async p => ({ ...p, url: await signedPhotoUrl(p.blob_pathname) })))
  return { ...row, photos, status: effectiveReturnStatus(row), status_auto: computeReturnStatus(row), overdue: isReturnOverdue(row) }
}

async function fetchReturn(id, withActivity = false) {
  const select = withActivity ? RETURN_SELECT_WITH_ACTIVITY : RETURN_SELECT
  const r = await axios.get(sb('returns', `${select}&id=eq.${id}&limit=1`), { headers: sbH() })
  return r.data?.[0] || null
}

const returnActor = req => req.installer?.name || clerkDisplayName(req.clerkUser) || null

async function logReturnActivity(returnId, actor, action, changes = null) {
  try {
    await axios.post(sb('return_activity'), { return_id: returnId, actor, action, changes }, { headers: sbH() })
  } catch (e) {
    console.error('return activity log error', e.message)
  }
}

// "Remembers" a newly typed staff name / freight company / factory location so it's in the
// dropdown next time. Lists live in eod_config.
async function rememberOption(key, value, defaults = []) {
  const v = String(value || '').trim()
  if (!v) return
  const list = await getConfig(key, defaults)
  if (list.some(x => x.toLowerCase() === v.toLowerCase())) return
  await setConfig(key, [...list, v], 'returns')
}
async function rememberReturnOptions(fields) {
  await Promise.all([
    rememberOption('returns_staff_names', fields.requested_by, DEFAULT_RETURNS_STAFF),
    rememberOption('returns_staff_names', fields.received_by, DEFAULT_RETURNS_STAFF),
    rememberOption('returns_staff_names', fields.responsible_person, DEFAULT_RETURNS_STAFF),
    rememberOption('returns_freight_companies', fields.freight_company),
    rememberOption('returns_factory_locations', fields.factory_location),
  ]).catch(e => console.error('remember option error', e.message))
}

function validateReturnItems(items) {
  if (items === undefined) return undefined
  if (!Array.isArray(items)) throw new Error('items must be an array')
  if (items.length > 3) throw new Error('A return can have at most 3 items')
  return items.map(it => {
    const description = String(it?.description || '').trim()
    const quantity = Number(it?.quantity)
    const action = String(it?.action || '').trim()
    if (action && !RETURN_ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`)
    return { description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, action: action || null }
  }).filter(it => it.description)
}

// Pulls the writable columns out of a request body, validating as it goes. Returns only
// the keys that were actually present so a section-by-section save never clobbers
// another section's fields.
function parseReturnPatch(body) {
  const patch = {}
  for (const f of RETURN_TEXT_FIELDS) {
    if (body[f] !== undefined) patch[f] = body[f] == null ? null : String(body[f]).trim() || null
  }
  for (const f of RETURN_DATE_FIELDS) {
    if (body[f] === undefined) continue
    if (body[f] && !isIsoDate(body[f])) throw new Error(`${f} must be a YYYY-MM-DD date`)
    patch[f] = body[f] || null
  }
  if (body.priority !== undefined) {
    if (!RETURN_PRIORITIES.includes(body.priority)) throw new Error('priority must be urgent, high or normal')
    patch.priority = body.priority
  }
  if (body.reason !== undefined) {
    if (!RETURN_REASONS.includes(body.reason)) throw new Error('Unknown reason')
    patch.reason = body.reason
  }
  if (body.photos_attached !== undefined) patch.photos_attached = body.photos_attached == null ? null : !!body.photos_attached
  if (body.job_id !== undefined) {
    if (body.job_id && !isUuid(body.job_id)) throw new Error('Invalid job_id')
    patch.job_id = body.job_id || null
  }
  const items = validateReturnItems(body.items)
  if (items !== undefined) patch.items = items
  // Manual status override: a status name sets it, null hands control back to the automatic rule.
  if (body.status !== undefined) {
    if (body.status === null) { patch.status_manual = false }
    else {
      if (!RETURN_STATUSES.includes(body.status)) throw new Error('Unknown status')
      patch.status = body.status
      patch.status_manual = true
    }
  }
  return patch
}

// ── Returns notifications (email, per-user opt-in, plus an admin master switch) ──

async function returnsNotificationRecipients(event) {
  const master = await getConfig('returns_notifications_enabled', false)
  if (!master) return []
  const prefs = await getConfig('returns_notification_prefs', {})
  return [...new Set(Object.values(prefs || {})
    .filter(p => p?.events?.[event] && isValidEmail(p.email))
    .map(p => p.email))]
}

function returnEmailHtml(ret, headline) {
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const priority = ret.priority.charAt(0).toUpperCase() + ret.priority.slice(1)
  return `
    <p><strong>${headline}</strong></p>
    <table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr><td><b>Return</b></td><td>${ret.return_number}</td></tr>
      <tr><td><b>Job</b></td><td>${ret.original_job_number} — ${ret.original_job_name}</td></tr>
      <tr><td><b>Priority</b></td><td>${priority}</td></tr>
      <tr><td><b>Status</b></td><td>${RETURN_STATUS_LABELS[effectiveReturnStatus(ret)]}${isReturnOverdue(ret) ? ' — OVERDUE' : ''}</td></tr>
      <tr><td><b>Reason</b></td><td>${ret.reason}</td></tr>
      <tr><td><b>Estimated arrival at factory</b></td><td>${fmt(ret.estimated_arrival_date)}</td></tr>
    </table>
    <p><a href="${RETURNS_APP_URL}/returns/${ret.id}">Open this return in Harrows Install</a></p>
  `
}

// Never allowed to fail the request that triggered it — every caller awaits this inside
// its own try/catch, same as sendReportNotification.
async function notifyReturnEvent(event, ret) {
  const emails = await returnsNotificationRecipients(event)
  if (!emails.length) return
  const label = `${ret.return_number} · Job ${ret.original_job_number} ${ret.original_job_name}`
  const subjects = {
    new_return: `New return logged — ${label}`,
    urgent_logged: `URGENT return — ${label}`,
    freight_booked: `Freight booked — ${label}`,
    overdue: `OVERDUE return — ${label}`,
    received: `Received at factory — ${label}`,
    completed: `Return completed — ${label}`,
  }
  const headlines = {
    new_return: 'A new return has been logged.',
    urgent_logged: 'An URGENT return has been logged.',
    freight_booked: 'Freight has been booked for this return.',
    overdue: 'This return has passed its estimated arrival date and has not been received at the factory.',
    received: 'This return has been received at the factory.',
    completed: 'This return has been completed and given its new SO / job number.',
  }
  await sendGraphMail({ to: emails.join(', '), subject: subjects[event], html: returnEmailHtml(ret, headlines[event]) })
}
async function safeNotifyReturn(event, ret) {
  try { await notifyReturnEvent(event, ret) } catch (e) { console.error(`return notification (${event}) error`, e.message) }
}

// ── Returns routes ──────────────────────────────────────────────────────────────

app.get('/api/install/returns/options', requireInstallerOrAdmin, async (req, res) => {
  try {
    const [staff, freightCompanies, factoryLocations] = await Promise.all([
      getConfig('returns_staff_names', DEFAULT_RETURNS_STAFF),
      getConfig('returns_freight_companies', []),
      getConfig('returns_factory_locations', []),
    ])
    res.json({ staff, freightCompanies, factoryLocations, reasons: RETURN_REASONS, actions: RETURN_ACTIONS })
  } catch (e) {
    console.error('returns options error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/install/returns', requireInstallerOrAdmin, async (req, res) => {
  try {
    let qs = `${RETURN_SELECT}&order=created_at.desc&limit=1000`
    if (req.query.job_id) {
      if (!isUuid(String(req.query.job_id))) return res.status(400).json({ error: 'Invalid job_id' })
      qs += `&job_id=eq.${req.query.job_id}`
    }
    const r = await axios.get(sb('returns', qs), { headers: sbH() })
    const returns = await Promise.all(r.data.map(decorateReturn))
    res.json({ returns })
  } catch (e) {
    console.error('returns list error', JSON.stringify(e.response?.data) || e.message)
    res.status(500).json({ error: e.response?.data?.message || e.message })
  }
})

app.get('/api/install/returns/:id', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const row = await fetchReturn(req.params.id, true)
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json({ return: await decorateReturn(row) })
  } catch (e) {
    console.error('return get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/install/returns', requireInstallerOrAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    let patch
    try { patch = parseReturnPatch(body) } catch (e) { return res.status(400).json({ error: e.message }) }
    if (patch.job_id) {
      // Linked to an install record: fill anything the client left blank from the job card.
      const jr = await axios.get(sb('job_cards', `id=eq.${patch.job_id}&limit=1`), { headers: sbH() })
      const job = jr.data?.[0]
      if (!job) return res.status(400).json({ error: 'That install job no longer exists' })
      patch.original_job_number = patch.original_job_number || job.job_number
      patch.original_job_name = patch.original_job_name || job.project_name
      patch.site_address = patch.site_address || job.address || null
    }
    if (!patch.original_job_number || !patch.original_job_name) return res.status(400).json({ error: 'Original job number and job name are required' })
    if (!patch.reason) return res.status(400).json({ error: 'A reason for the return is required' })
    if (!patch.pickup_location && patch.site_address) patch.pickup_location = patch.site_address
    delete patch.status_manual
    delete patch.status
    const actor = returnActor(req)
    const row = { ...patch, priority: patch.priority || 'normal', items: patch.items || [], created_by: actor }
    row.status = computeReturnStatus(row)
    const r = await axios.post(sb('returns'), row, { headers: sbH({ Prefer: 'return=representation' }) })
    const created = r.data[0]

    const sitePhotos = Array.isArray(body.site_photos) ? body.site_photos.filter(p => typeof p === 'string' && p.startsWith('install/')) : []
    if (sitePhotos.length) {
      await axios.post(sb('return_photos'), sitePhotos.map(p => ({ return_id: created.id, blob_pathname: p, kind: 'site' })), { headers: sbH() })
    }
    await logReturnActivity(created.id, actor, 'created', sitePhotos.length ? { site_photos: { from: 0, to: sitePhotos.length } } : null)
    await rememberReturnOptions(created)

    const full = await decorateReturn(await fetchReturn(created.id, true))
    await safeNotifyReturn('new_return', full)
    if (full.priority === 'urgent') await safeNotifyReturn('urgent_logged', full)
    if (full.freight_company || full.freight_docket) await safeNotifyReturn('freight_booked', full)
    res.json({ return: full })
  } catch (e) {
    console.error('return create error', JSON.stringify(e.response?.data) || e.message)
    res.status(500).json({ error: e.response?.data?.message || e.message })
  }
})

app.patch('/api/install/returns/:id', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const current = await fetchReturn(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    let patch
    try { patch = parseReturnPatch(req.body || {}) } catch (e) { return res.status(400).json({ error: e.message }) }
    if (patch.original_job_number === null || patch.original_job_name === null) return res.status(400).json({ error: 'Original job number and job name are required' })

    const changes = {}
    for (const [k, v] of Object.entries(patch)) {
      const before = current[k] ?? null
      if (JSON.stringify(before) !== JSON.stringify(v)) changes[k] = { from: before, to: v }
    }
    if (!Object.keys(changes).length) return res.json({ return: await decorateReturn(await fetchReturn(req.params.id, true)), changed: false })

    const merged = { ...current, ...patch }
    if (!merged.status_manual) patch.status = computeReturnStatus(merged)
    patch.updated_at = new Date().toISOString()
    await axios.patch(sb('returns', `id=eq.${req.params.id}`), patch, { headers: sbH() })

    const actor = returnActor(req)
    await logReturnActivity(req.params.id, actor, changes.status_manual || changes.status ? 'status_set' : 'updated', changes)
    await rememberReturnOptions(patch)

    const full = await decorateReturn(await fetchReturn(req.params.id, true))
    const wasBooked = !!(current.freight_company || current.freight_docket)
    const nowBooked = !!(full.freight_company || full.freight_docket)
    const docketAdded = !current.freight_docket && !!full.freight_docket
    if ((!wasBooked && nowBooked) || docketAdded) await safeNotifyReturn('freight_booked', full)
    if (!current.date_received && full.date_received) await safeNotifyReturn('received', full)
    if (current.priority !== 'urgent' && full.priority === 'urgent') await safeNotifyReturn('urgent_logged', full)
    res.json({ return: full, changed: true })
  } catch (e) {
    console.error('return update error', JSON.stringify(e.response?.data) || e.message)
    res.status(500).json({ error: e.response?.data?.message || e.message })
  }
})

app.post('/api/install/returns/:id/complete', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const current = await fetchReturn(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    const newSo = String(req.body?.new_so_number ?? current.new_so_number ?? '').trim()
    if (!newSo) return res.status(400).json({ error: 'A new SO / job number is required to complete a return' })
    const actor = returnActor(req)
    const patch = { new_so_number: newSo, completed_at: new Date().toISOString(), completed_by: actor, status: 'completed', status_manual: false, updated_at: new Date().toISOString() }
    await axios.patch(sb('returns', `id=eq.${req.params.id}`), patch, { headers: sbH() })
    await logReturnActivity(req.params.id, actor, 'completed', { new_so_number: { from: current.new_so_number, to: newSo } })
    const full = await decorateReturn(await fetchReturn(req.params.id, true))
    await safeNotifyReturn('completed', full)
    res.json({ return: full })
  } catch (e) {
    console.error('return complete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/install/returns/:id/reopen', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const current = await fetchReturn(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    const reopened = { ...current, completed_at: null, completed_by: null }
    await axios.patch(sb('returns', `id=eq.${req.params.id}`), {
      completed_at: null, completed_by: null, status: computeReturnStatus(reopened), status_manual: false, updated_at: new Date().toISOString(),
    }, { headers: sbH() })
    await logReturnActivity(req.params.id, returnActor(req), 'reopened')
    res.json({ return: await decorateReturn(await fetchReturn(req.params.id, true)) })
  } catch (e) {
    console.error('return reopen error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/install/returns/:id', requireAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    await axios.delete(sb('returns', `id=eq.${req.params.id}`), { headers: sbH() })
    res.json({ ok: true })
  } catch (e) {
    console.error('return delete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Photos: "site" (taken when the return is logged) and "factory" (taken on arrival).
app.post('/api/install/returns/:id/photos', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const kind = req.body?.kind === 'factory' ? 'factory' : 'site'
    const pathnames = (Array.isArray(req.body?.pathnames) ? req.body.pathnames : []).filter(p => typeof p === 'string' && p.startsWith('install/'))
    if (!pathnames.length) return res.status(400).json({ error: 'pathnames required' })
    await axios.post(sb('return_photos'), pathnames.map(p => ({ return_id: req.params.id, blob_pathname: p, kind })), { headers: sbH() })
    await axios.patch(sb('returns', `id=eq.${req.params.id}`), { updated_at: new Date().toISOString(), ...(kind === 'site' ? { photos_attached: true } : {}) }, { headers: sbH() })
    await logReturnActivity(req.params.id, returnActor(req), 'photo_added', { [`${kind}_photos`]: { from: null, to: pathnames.length } })
    res.json({ return: await decorateReturn(await fetchReturn(req.params.id, true)) })
  } catch (e) {
    console.error('return photo add error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/install/returns/:id/photos/:photoId', requireInstallerOrAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.photoId)) return res.status(400).json({ error: 'Invalid id' })
    await axios.delete(sb('return_photos', `id=eq.${req.params.photoId}&return_id=eq.${req.params.id}`), { headers: sbH() })
    await logReturnActivity(req.params.id, returnActor(req), 'photo_removed')
    res.json({ return: await decorateReturn(await fetchReturn(req.params.id, true)) })
  } catch (e) {
    console.error('return photo delete error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── "Receive an item": AI photo match against open returns' site photos ──────────
// Compares a photo of what just arrived at the factory against the first site photo of
// every in-progress return that hasn't been received yet, and returns the top 3 likely
// matches with a confidence. Suggestion only — the user always confirms, nothing is
// written here.

const RETURN_MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          candidate: { type: 'integer', description: 'The candidate number as labelled' },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', description: 'One short sentence on why this could be the same item' },
        },
        required: ['candidate', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
}
const RETURN_MATCH_MAX_CANDIDATES = 25

async function fetchBlobBase64(pathname) {
  let url = await signedPhotoUrl(pathname)
  if (!url) {
    // Wildcard token unavailable — fall back to a per-pathname token (same as /photos/url).
    const signedToken = await issueSignedToken({ pathname, operations: ['get'], validUntil: Date.now() + 10 * 60 * 1000 })
    url = (await presignUrl(signedToken, { pathname, operation: 'get', access: 'private' })).presignedUrl
  }
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })
  const type = String(r.headers['content-type'] || 'image/jpeg').split(';')[0]
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null
  return { mediaType: type, data: Buffer.from(r.data).toString('base64') }
}

app.post('/api/install/returns/match', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { mediaType, data } = req.body || {}
    if (!mediaType || !data || !String(mediaType).startsWith('image/')) return res.status(400).json({ error: 'An image is required' })

    const r = await axios.get(sb('returns', `${RETURN_SELECT}&completed_at=is.null&date_received=is.null&order=created_at.desc&limit=200`), { headers: sbH() })
    const candidates = r.data.filter(row => (row.photos || []).some(p => p.kind === 'site')).slice(0, RETURN_MATCH_MAX_CANDIDATES)
    if (!candidates.length) return res.json({ matches: [], candidateCount: 0 })

    const content = [
      { type: 'text', text: 'PHOTO OF THE ITEM THAT HAS JUST ARRIVED AT THE FACTORY:' },
      { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
    ]
    const numbered = []
    for (const row of candidates) {
      const sitePhoto = row.photos.find(p => p.kind === 'site')
      const img = await fetchBlobBase64(sitePhoto.blob_pathname).catch(() => null)
      if (!img) continue
      numbered.push(row)
      const n = numbered.length
      const items = (row.items || []).map(it => `${it.quantity}× ${it.description}`).join(', ') || 'no item details'
      content.push({ type: 'text', text: `CANDIDATE ${n}: ${row.return_number} — Job ${row.original_job_number} ${row.original_job_name}. Reason: ${row.reason}. Items: ${items}. ${row.issue_description ? 'Issue: ' + row.issue_description : ''}` })
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })
    }
    if (!numbered.length) return res.json({ matches: [], candidateCount: 0 })
    content.push({ type: 'text', text: 'These are furniture items being returned to a factory. Compare the arrived item photo against each candidate\'s site photo (taken when the return was logged, possibly from a different angle, lighting or with packaging). Judge by the type of furniture, shape, colour, fabric/material, visible damage and the item descriptions. Return up to 3 candidates most likely to be the same physical item, highest confidence first, with an honest confidence from 0 to 100. If nothing plausibly matches, return an empty list.' })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 600,
      output_config: { format: { type: 'json_schema', schema: RETURN_MATCH_SCHEMA } },
      messages: [{ role: 'user', content }],
    })
    if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Could not compare this photo' })
    const textBlock = response.content.find(b => b.type === 'text')
    const parsed = JSON.parse(textBlock?.text || '{"matches":[]}')
    const seen = new Set()
    const matches = []
    for (const m of (parsed.matches || []).sort((a, b) => b.confidence - a.confidence)) {
      const row = numbered[m.candidate - 1]
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)
      matches.push({ confidence: Math.max(0, Math.min(100, Math.round(m.confidence))), reason: m.reason, return: await decorateReturn(row) })
      if (matches.length === 3) break
    }
    res.json({ matches, candidateCount: numbered.length })
  } catch (e) {
    console.error('return match error', e.message)
    if (e instanceof Anthropic.BadRequestError) return res.status(400).json({ error: 'Could not read this photo — try again' })
    res.status(500).json({ error: 'Photo matching failed — use "Not listed / search manually"' })
  }
})

// ── Returns notification settings ───────────────────────────────────────────────
// One pref record per person, keyed by their Clerk user id or installer id. All events
// default off; the admin-only master switch defaults off too.

const returnsPrefKey = req => req.installer ? `installer:${req.installer.id}` : `clerk:${req.clerkUserId}`

app.get('/api/install/returns-notifications', requireInstallerOrAdmin, async (req, res) => {
  try {
    const [master, prefs] = await Promise.all([
      getConfig('returns_notifications_enabled', false),
      getConfig('returns_notification_prefs', {}),
    ])
    const mine = prefs?.[returnsPrefKey(req)] || null
    let defaultEmail = ''
    if (req.installer) {
      const ir = await axios.get(sb('installers', `id=eq.${req.installer.id}&select=email&limit=1`), { headers: sbH() })
      defaultEmail = ir.data?.[0]?.email || ''
    } else {
      defaultEmail = req.clerkUser?.email_addresses?.[0]?.email_address || ''
    }
    res.json({
      master: !!master,
      canManageMaster: !req.installer,
      events: RETURN_EVENTS,
      email: mine?.email || defaultEmail,
      prefs: Object.fromEntries(RETURN_EVENTS.map(ev => [ev, !!mine?.events?.[ev]])),
    })
  } catch (e) {
    console.error('returns notifications get error', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/install/returns-notifications', requireInstallerOrAdmin, async (req, res) => {
  try {
    const { email, prefs, master } = req.body || {}
    if (master !== undefined) {
      if (req.installer) return res.status(403).json({ error: 'Only office admins can change the master switch' })
      await setConfig('returns_notifications_enabled', !!master, req.clerkUserId)
    }
    if (prefs !== undefined || email !== undefined) {
      const all = await getConfig('returns_notification_prefs', {})
      const key = returnsPrefKey(req)
      const cur = all[key] || { events: {} }
      const nextEmail = email !== undefined ? String(email || '').trim() : (cur.email || '')
      const nextEvents = { ...cur.events }
      if (prefs && typeof prefs === 'object') for (const ev of RETURN_EVENTS) if (prefs[ev] !== undefined) nextEvents[ev] = !!prefs[ev]
      if (Object.values(nextEvents).some(Boolean) && !isValidEmail(nextEmail)) return res.status(400).json({ error: 'Enter a valid email address to receive notifications' })
      all[key] = { name: returnActor(req) || '', email: nextEmail, events: nextEvents, updatedAt: new Date().toISOString() }
      await setConfig('returns_notification_prefs', all, key)
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('returns notifications update error', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Daily overdue sweep (Vercel cron, see vercel.json) — emails once per return per
// estimated-arrival date, so a date pushed out and missed again is flagged again.
function requireCron(req, res, next) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET not configured' })
  const raw = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (raw === secret || req.query.secret === secret) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

app.get('/api/install/returns-overdue-check', requireCron, async (req, res) => {
  try {
    const r = await axios.get(sb('returns', `${RETURN_SELECT}&completed_at=is.null&date_received=is.null&estimated_arrival_date=lt.${nzToday()}&limit=500`), { headers: sbH() })
    const due = r.data.filter(row => row.overdue_notified_for !== row.estimated_arrival_date)
    let sent = 0
    for (const row of due) {
      try {
        await notifyReturnEvent('overdue', row)
        await axios.patch(sb('returns', `id=eq.${row.id}`), { overdue_notified_for: row.estimated_arrival_date }, { headers: sbH() })
        sent++
      } catch (e) {
        console.error('overdue notify error', row.return_number, e.message)
      }
    }
    res.json({ overdue: r.data.length, notified: sent })
  } catch (e) {
    console.error('overdue check error', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default app
