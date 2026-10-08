import { useEffect, useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import type { JobCard, ReturnItem, ReturnOptions, ReturnPriority, ReturnRecord, ReturnStatus } from '../../types'
import { RETURN_REASONS, STATUS_STEPS, fmtDateLong, fmtDateTime, priorityBadge, priorityLabel, statusLabel, todayNZ } from '../../lib/returns'
import PhotoUpload from '../PhotoUpload'
import ReturnPhotoGrid from './ReturnPhotoGrid'
import ComboField from './ComboField'
import StatusTracker from './StatusTracker'
import { DateField, ItemsEditor, JobPicker, ModalFrame, PriorityPicker, SectionHeading, SelectField, TextArea, TextField, YesNo } from './fields'
import { generateReturnPDF } from '../../utils/generateReturnPDF'
import { printReturnTag, shareReturnTag } from '../../utils/generateReturnTag'

export type SectionId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

interface Props {
  returnId: string
  options: ReturnOptions
  isAdmin: boolean
  focusSection?: SectionId
  onClose: () => void
  onChanged: (r: ReturnRecord | null) => void // null = deleted
}

type Draft = Partial<ReturnRecord>
const pick = (r: ReturnRecord, keys: (keyof ReturnRecord)[]): Draft => Object.fromEntries(keys.map(k => [k, r[k] ?? (k === 'items' ? [] : null)]))

export default function ReturnDetailModal({ returnId, options, isAdmin, focusSection, onClose, onChanged }: Props) {
  const [ret, setRet] = useState<ReturnRecord | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const focusRef = useRef<HTMLDivElement>(null)

  const load = () => axios.get(`/api/install/returns/${returnId}`).then(r => setRet(r.data.return)).catch(e => setError(e?.response?.data?.error || 'Could not load this return'))
  useEffect(() => { load() }, [returnId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ret && focusSection && focusRef.current) focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [ret?.id, focusSection]) // eslint-disable-line react-hooks/exhaustive-deps

  const applied = (r: ReturnRecord) => { setRet(r); onChanged(r) }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError('')
    try { await fn() } catch (e: any) { setError(e?.response?.data?.error || e?.message || 'Something went wrong') } finally { setBusy('') }
  }

  const setStatus = (status: ReturnStatus | null) => run('status', async () => {
    const r = await axios.patch(`/api/install/returns/${returnId}`, { status })
    applied(r.data.return)
  })
  const addPhotos = (kind: 'site' | 'factory', pathnames: string[]) => run('photos', async () => {
    if (!pathnames.length) return
    const r = await axios.post(`/api/install/returns/${returnId}/photos`, { kind, pathnames })
    applied(r.data.return)
  })
  const removePhoto = (photoId: string) => run('photos', async () => {
    if (!confirm('Remove this photo?')) return
    const r = await axios.delete(`/api/install/returns/${returnId}/photos/${photoId}`)
    applied(r.data.return)
  })
  const complete = (newSo: string) => run('complete', async () => {
    const r = await axios.post(`/api/install/returns/${returnId}/complete`, { new_so_number: newSo })
    applied(r.data.return)
  })
  const reopen = () => run('reopen', async () => {
    const r = await axios.post(`/api/install/returns/${returnId}/reopen`)
    applied(r.data.return)
  })
  const remove = () => run('delete', async () => {
    if (!confirm(`Delete ${ret?.return_number}? This cannot be undone.`)) return
    await axios.delete(`/api/install/returns/${returnId}`)
    onChanged(null)
    onClose()
  })

  if (error && !ret) return <ModalFrame title="Return" onClose={onClose}><p className="text-sm text-red-500">{error}</p></ModalFrame>
  if (!ret) return <ModalFrame title="Return" onClose={onClose}><p className="text-sm text-gray-400">Loading…</p></ModalFrame>

  const sitePhotos = ret.photos.filter(p => p.kind === 'site')
  const factoryPhotos = ret.photos.filter(p => p.kind === 'factory')
  // Which section is "next": that one opens expanded, the rest collapse to a summary line
  // (still one tap to edit). A deep link / receive flow overrides this with its own section.
  const stage: SectionId = ret.date_received || ret.completed_at ? 'F' : (ret.freight_company || ret.freight_docket) ? 'E' : 'D'
  const isOpen = (s: SectionId) => focusSection ? s === focusSection : s === stage

  return (
    <ModalFrame wide onClose={onClose}
      title={<span className="flex items-center gap-2"><span className="font-mono bg-gray-900 text-white px-2 py-0.5 rounded text-xs">{ret.return_number}</span><span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${priorityBadge(ret.priority)}`}>{priorityLabel(ret.priority)}</span>{ret.overdue && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>}</span>}
      subtitle={`Job ${ret.original_job_number} · ${ret.original_job_name}`}
      footer={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => printReturnTag(ret)} className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">Print tag</button>
          <button onClick={() => shareReturnTag(ret)} className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">Email tag</button>
          <button onClick={() => run('pdf', () => generateReturnPDF(ret))} disabled={busy === 'pdf'} className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">{busy === 'pdf' ? 'Generating…' : 'Download PDF'}</button>
          <span className="flex-1" />
          {isAdmin && <button onClick={remove} className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>}
        </div>
      }>
      <div className="space-y-5">
        {/* Status tracker + manual override */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <StatusTracker r={ret} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-800">
              <span className="font-semibold">{statusLabel(ret.status)}</span>
              <span className="text-xs text-gray-400 ml-2">{ret.status_manual ? `set manually · automatic would be "${statusLabel(ret.status_auto)}"` : 'set automatically'}</span>
            </p>
            {ret.status !== 'completed' && (
              <select value={ret.status_manual ? ret.status : ''} onChange={e => setStatus((e.target.value || null) as ReturnStatus | null)} disabled={busy === 'status'}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                <option value="">Automatic</option>
                {STATUS_STEPS.filter(s => s.value !== 'completed').map(s => <option key={s.value} value={s.value}>Override: {s.label}</option>)}
              </select>
            )}
          </div>
          {ret.overdue && <p className="text-xs text-red-600 font-medium">Estimated arrival {fmtDateLong(ret.estimated_arrival_date)} has passed and this hasn't been received at the factory.</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </section>

        <SectionEditor ret={ret} letter="A" title="Job information" fields={['job_id', 'original_job_number', 'original_job_name', 'site_address', 'new_so_number', 'required_by', 'priority']} onSaved={applied} defaultOpen={isOpen('A')}>
          {(d, set) => (
            <>
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked install job</span>
                <div className="mt-1">
                  <JobPicker job={d.job_id ? (d.job_id === ret.job_id ? ret.job : (d as any)._job ?? null) : null}
                    onPick={(j: JobCard | null) => set({ job_id: j?.id ?? null, _job: j, ...(j ? { original_job_number: j.job_number, original_job_name: j.project_name, site_address: j.address } : {}) } as Draft)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Original job number" value={d.original_job_number || ''} onChange={v => set({ original_job_number: v })} required />
                <TextField label="Original job name" value={d.original_job_name || ''} onChange={v => set({ original_job_name: v })} required />
              </div>
              <TextField label="Site address" value={d.site_address || ''} onChange={v => set({ site_address: v })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="New SO / job number" value={d.new_so_number || ''} onChange={v => set({ new_so_number: v })} />
                <DateField label="Required by / deadline" value={d.required_by || ''} onChange={v => set({ required_by: v })} />
              </div>
              <PriorityPicker value={(d.priority as ReturnPriority) || 'normal'} onChange={v => set({ priority: v })} />
            </>
          )}
        </SectionEditor>

        <SectionEditor ret={ret} letter="B" title="Reason for return" fields={['reason', 'issue_description', 'photos_attached']} onSaved={applied} defaultOpen={isOpen('B')}
          extra={
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Site photos</span>
              <div className="mt-1 space-y-2">
                <ReturnPhotoGrid photos={sitePhotos.map(p => ({ key: p.id, pathname: p.blob_pathname, url: p.url }))} onRemove={p => removePhoto(p.key)} emptyText="No site photos yet." />
                <PhotoUpload reportKey={`returns/${ret.id}`} pathnames={[]} onChange={paths => addPhotos('site', paths)} hideList compact />
              </div>
            </div>
          }>
          {(d, set) => (
            <>
              <SelectField label="Reason" value={d.reason || ''} onChange={v => set({ reason: v })} options={options.reasons?.length ? options.reasons : RETURN_REASONS} required />
              <TextArea label="Description of issue" value={d.issue_description || ''} onChange={v => set({ issue_description: v })} rows={3} />
              <YesNo label="Photos attached" value={d.photos_attached ?? null} onChange={v => set({ photos_attached: v })} />
            </>
          )}
        </SectionEditor>

        <SectionEditor ret={ret} letter="C" title="Item information" fields={['items']} onSaved={applied} defaultOpen={isOpen('C')}>
          {(d, set) => <ItemsEditor items={(d.items as ReturnItem[]) || []} onChange={items => set({ items })} />}
        </SectionEditor>

        <SectionEditor ret={ret} letter="D" title="Freight return" fields={['requested_by', 'freight_company', 'freight_docket', 'pickup_location', 'expected_pickup_date', 'estimated_arrival_date']} onSaved={applied} defaultOpen={isOpen('D')}>
          {(d, set) => (
            <>
              <ComboField label="Requested by" value={d.requested_by || ''} onChange={v => set({ requested_by: v })} options={options.staff} addLabel="+ Add a new name…" />
              <ComboField label="Freight company" value={d.freight_company || ''} onChange={v => set({ freight_company: v })} options={options.freightCompanies} addLabel="+ Add a new company…" />
              <TextField label="Freight docket number" value={d.freight_docket || ''} onChange={v => set({ freight_docket: v })} placeholder="Docket pending" />
              <div>
                <TextField label="Pickup location" value={d.pickup_location || ''} onChange={v => set({ pickup_location: v })} />
                {ret.site_address && d.pickup_location !== ret.site_address && (
                  <button type="button" onClick={() => set({ pickup_location: ret.site_address })} className="text-[11px] text-gray-500 underline mt-1">Use site address</button>
                )}
              </div>
              <DateField label="Expected pickup date" value={d.expected_pickup_date || ''} onChange={v => set({ expected_pickup_date: v })} />
              <DateField label="Estimated arrival at factory" value={d.estimated_arrival_date || ''} onChange={v => set({ estimated_arrival_date: v })} prominent hint="The date everyone plans around — when it should be in Timaru." />
            </>
          )}
        </SectionEditor>

        <div ref={focusSection === 'E' ? focusRef : undefined}>
          <SectionEditor ret={ret} letter="E" title="Factory receiving" fields={['received_by', 'date_received', 'factory_location', 'arrival_damage', 'responsible_person']} onSaved={applied}
            defaultOpen={isOpen('E')} highlight={focusSection === 'E'}
            onOpen={d => (!d.date_received ? { date_received: todayNZ() } : null)}
            extra={
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Factory photos</span>
                <div className="mt-1 space-y-2">
                  <ReturnPhotoGrid photos={factoryPhotos.map(p => ({ key: p.id, pathname: p.blob_pathname, url: p.url }))} onRemove={p => removePhoto(p.key)} emptyText="No factory photos yet." />
                  <PhotoUpload reportKey={`returns/${ret.id}/factory`} pathnames={[]} onChange={paths => addPhotos('factory', paths)} hideList compact />
                </div>
              </div>
            }>
            {(d, set) => (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ComboField label="Received by" value={d.received_by || ''} onChange={v => set({ received_by: v })} options={options.staff} addLabel="+ Add a new name…" />
                  <DateField label="Date received" value={d.date_received || ''} onChange={v => set({ date_received: v })} />
                </div>
                <ComboField label="Location in factory" value={d.factory_location || ''} onChange={v => set({ factory_location: v })} options={options.factoryLocations} addLabel="+ Add a new location…" placeholder="e.g. Bay 3, Upholstery, Holding area" />
                <TextArea label="Damage on arrival / additional damage" value={d.arrival_damage || ''} onChange={v => set({ arrival_damage: v })} rows={3} />
                <ComboField label="Person responsible from here" value={d.responsible_person || ''} onChange={v => set({ responsible_person: v })} options={options.staff} addLabel="+ Add a new name…" />
              </>
            )}
          </SectionEditor>
        </div>

        <CompleteSection ret={ret} busy={busy} onComplete={complete} onReopen={reopen} defaultOpen={isOpen('F')} />

        {ret.activity && ret.activity.length > 0 && (
          <section className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">Activity</p>
            <ul className="space-y-1.5">
              {ret.activity.map(a => (
                <li key={a.id} className="text-xs text-gray-600">
                  <span className="text-gray-400">{fmtDateTime(a.created_at)}</span> · <span className="font-medium text-gray-800">{a.actor || 'Someone'}</span> {describeActivity(a.action, a.changes)}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-2">Logged {fmtDateTime(ret.created_at)}{ret.created_by ? ` by ${ret.created_by}` : ''}</p>
          </section>
        )}
      </div>
    </ModalFrame>
  )
}

const FIELD_LABELS: Record<string, string> = {
  job_id: 'linked install job', original_job_number: 'job number', original_job_name: 'job name', site_address: 'site address', new_so_number: 'new SO / job number',
  required_by: 'required-by date', priority: 'priority', reason: 'reason', issue_description: 'issue description', photos_attached: 'photos attached', items: 'items',
  requested_by: 'requested by', freight_company: 'freight company', freight_docket: 'docket number', pickup_location: 'pickup location', expected_pickup_date: 'expected pickup',
  estimated_arrival_date: 'estimated arrival', received_by: 'received by', date_received: 'date received', factory_location: 'factory location', arrival_damage: 'damage on arrival',
  responsible_person: 'person responsible', status: 'status', status_manual: 'status override', site_photos: 'site photos', factory_photos: 'factory photos',
}
function describeActivity(action: string, changes: Record<string, { from: unknown; to: unknown }> | null) {
  const fields = Object.keys(changes || {}).filter(k => k !== 'status' && k !== 'status_manual').map(k => FIELD_LABELS[k] || k)
  switch (action) {
    case 'created': return 'logged this return'
    case 'completed': return `marked it complete${changes?.new_so_number?.to ? ` — new SO ${changes.new_so_number.to}` : ''}`
    case 'reopened': return 'reopened it'
    case 'photo_added': return `added ${fields.join(', ') || 'photos'}`
    case 'photo_removed': return 'removed a photo'
    case 'status_set': {
      const s = changes?.status?.to as string | undefined
      return s ? `set the status to ${statusLabel(s as ReturnStatus)}` : 'put the status back to automatic'
    }
    default: return `updated ${fields.join(', ') || 'details'}`
  }
}

// One collapsible, independently-saveable section. Keeps its own draft so saving another
// section (which refreshes the record) never wipes edits in progress here.
function SectionEditor({ ret, letter, title, fields, children, onSaved, extra, defaultOpen = true, highlight, onOpen }: {
  ret: ReturnRecord
  letter: string
  title: string
  fields: (keyof ReturnRecord)[]
  children: (draft: Draft, set: (patch: Draft) => void) => ReactNode
  onSaved: (r: ReturnRecord) => void
  extra?: ReactNode
  defaultOpen?: boolean
  highlight?: boolean
  onOpen?: (draft: Draft) => Draft | null
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState<Draft>(() => pick(ret, fields))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const base = pick(ret, fields)
  const dirty = fields.some(k => JSON.stringify(draft[k] ?? null) !== JSON.stringify(base[k] ?? null))
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => { if (!dirtyRef.current) setDraft(pick(ret, fields)) }, [ret]) // eslint-disable-line react-hooks/exhaustive-deps
  // Prefill-on-open (e.g. Date received = today) only when someone actually opens the
  // section, or when it was opened for them by the receive flow — never just because the
  // return happened to render with the section expanded.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; if (!(open && highlight)) return }
    if (open && onOpen) { const p = onOpen(draft); if (p) setDraft(d => ({ ...d, ...p })) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Draft) => setDraft(d => ({ ...d, ...patch }))
  const save = async () => {
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = {}
      for (const k of fields) body[k] = draft[k] === '' ? null : draft[k]
      const r = await axios.patch(`/api/install/returns/${ret.id}`, body)
      onSaved(r.data.return)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }
  const summary = summarise(ret, letter)

  return (
    <section className={`border rounded-xl ${highlight ? 'border-harrows-yellow ring-2 ring-harrows-yellow/30' : 'border-gray-200'}`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
        <SectionHeading letter={letter} title={title} hint={!open ? summary : undefined} />
        <span className="flex items-center gap-2 shrink-0">
          {dirty && !open && <span className="text-[10px] font-bold text-amber-600 uppercase">Unsaved</span>}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {children(draft, set)}
          {(dirty || error) && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Saving…' : `Save section ${letter}`}
              </button>
              <button type="button" onClick={() => setDraft(pick(ret, fields))} className="text-xs text-gray-500 underline">Discard</button>
              {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
          )}
          {extra && <div className="pt-3 border-t border-gray-100">{extra}</div>}
        </div>
      )}
    </section>
  )
}

function summarise(r: ReturnRecord, letter: string): string {
  switch (letter) {
    case 'A': return [r.site_address, r.new_so_number ? `New SO ${r.new_so_number}` : null, r.required_by ? `Required by ${fmtDateLong(r.required_by)}` : null].filter(Boolean).join(' · ') || 'No address or deadline yet'
    case 'B': return [r.reason, r.issue_description].filter(Boolean).join(' — ')
    case 'C': return r.items.length ? r.items.map(i => `${i.quantity}× ${i.description}${i.action ? ` (${i.action})` : ''}`).join(', ') : 'No items added yet'
    case 'D': return [r.freight_company, r.freight_docket ? `Docket ${r.freight_docket}` : (r.freight_company ? 'Docket pending' : null), r.estimated_arrival_date ? `ETA ${fmtDateLong(r.estimated_arrival_date)}` : null].filter(Boolean).join(' · ') || 'No freight details yet'
    case 'E': return r.date_received ? [`Received ${fmtDateLong(r.date_received)}`, r.received_by, r.factory_location].filter(Boolean).join(' · ') : 'Not received yet'
    default: return ''
  }
}

function CompleteSection({ ret, busy, onComplete, onReopen, defaultOpen }: { ret: ReturnRecord; busy: string; onComplete: (so: string) => void; onReopen: () => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [so, setSo] = useState(ret.new_so_number || '')
  useEffect(() => { setSo(ret.new_so_number || '') }, [ret.new_so_number])
  const done = !!ret.completed_at
  return (
    <section className={`border rounded-xl ${done ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
        <SectionHeading letter="F" title="Complete" hint={!open ? (done ? `Completed ${fmtDateTime(ret.completed_at)}${ret.completed_by ? ` by ${ret.completed_by}` : ''} · New SO ${ret.new_so_number}` : 'Needs the new SO / job number') : undefined} />
        <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {done ? (
            <>
              <p className="text-sm text-gray-800">Completed <span className="font-medium">{fmtDateTime(ret.completed_at)}</span>{ret.completed_by ? ` by ${ret.completed_by}` : ''}. New SO / job number <span className="font-mono font-bold">{ret.new_so_number}</span>.</p>
              <button type="button" onClick={onReopen} disabled={busy === 'reopen'} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">{busy === 'reopen' ? 'Reopening…' : 'Reopen this return'}</button>
            </>
          ) : (
            <>
              <TextField label="New SO / job number" value={so} onChange={setSo} required placeholder="Required to complete" />
              <p className="text-xs text-gray-400">Marking complete records the date and who did it, and moves this return to the Completed tab.</p>
              <button type="button" onClick={() => onComplete(so)} disabled={!so.trim() || busy === 'complete'}
                className="w-full py-2.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {busy === 'complete' ? 'Completing…' : 'Mark as Complete'}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
