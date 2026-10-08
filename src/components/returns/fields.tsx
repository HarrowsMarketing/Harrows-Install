import { useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'
import type { JobCard, ReturnItem, ReturnPriority } from '../../types'
import { PRIORITIES, RETURN_ACTIONS } from '../../lib/returns'

const inputCls = 'mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white'
const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide'

export function TextField({ label, value, onChange, required, placeholder, type = 'text', inputMode }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; type?: string; inputMode?: 'numeric' | 'text'
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      <input type={type} inputMode={inputMode} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </label>
  )
}

export function TextArea({ label, value, onChange, rows = 2, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} className={inputCls} />
    </label>
  )
}

export function DateField({ label, value, onChange, prominent, hint }: { label: string; value: string; onChange: (v: string) => void; prominent?: boolean; hint?: string }) {
  return (
    <label className={`block ${prominent ? 'bg-amber-50 border-2 border-harrows-yellow rounded-xl p-3' : ''}`}>
      <span className={`${labelCls} ${prominent ? '!text-gray-900' : ''}`}>{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className={`${inputCls} ${prominent ? 'text-base font-semibold border-harrows-yellow/60' : ''}`} />
    </label>
  )
}

export function SelectField({ label, value, onChange, options, required, placeholder = '—' }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | string[]; required?: boolean; placeholder?: string
}) {
  const opts = options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
  return (
    <label className="block">
      <span className={labelCls}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">{placeholder}</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function PriorityPicker({ value, onChange }: { value: ReturnPriority; onChange: (v: ReturnPriority) => void }) {
  return (
    <div>
      <span className={labelCls}>Priority</span>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {PRIORITIES.map(p => (
          <button key={p.value} type="button" onClick={() => onChange(p.value)}
            className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wide border-2 transition-colors ${
              value === p.value ? `${p.badge} border-transparent` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 inline-flex border border-gray-200 rounded-lg p-0.5 bg-white">
        {[true, false].map(v => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${value === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ItemsEditor({ items, onChange }: { items: ReturnItem[]; onChange: (items: ReturnItem[]) => void }) {
  const rows = items.length ? items : [{ description: '', quantity: 1, action: null }]
  const update = (i: number, patch: Partial<ReturnItem>) => onChange(rows.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-3">
      {rows.map((it, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Item {i + 1}</span>
            {rows.length > 1 && <button type="button" onClick={() => remove(i)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>}
          </div>
          <TextField label="Item description" value={it.description} onChange={v => update(i, { description: v })} placeholder="e.g. Boardroom chair, charcoal fabric" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Quantity" type="number" inputMode="numeric" value={String(it.quantity ?? '')} onChange={v => update(i, { quantity: Math.max(1, Number(v) || 1) })} />
            <SelectField label="Action required" value={it.action ?? ''} onChange={v => update(i, { action: v || null })} options={RETURN_ACTIONS} />
          </div>
        </div>
      ))}
      {rows.length < 3 && (
        <button type="button" onClick={() => onChange([...rows, { description: '', quantity: 1, action: null }])}
          className="text-xs font-semibold text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full hover:border-gray-400">
          + Add item ({rows.length}/3)
        </button>
      )}
    </div>
  )
}

// Searchable picker over existing install jobs (GET /api/install/jobs?search=).
export function JobPicker({ job, onPick }: { job: Pick<JobCard, 'id' | 'job_number' | 'project_name' | 'address'> | null; onPick: (job: JobCard | null) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<JobCard[]>([])
  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => {
      axios.get('/api/install/jobs', { params: { search: q } }).then(r => setResults(r.data.jobs)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  if (job) {
    return (
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{job.project_name}</p>
          <p className="text-xs text-gray-400">Job {job.job_number}{job.address ? ` · ${job.address}` : ''}</p>
        </div>
        <button type="button" onClick={() => onPick(null)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0 ml-2">Change</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search install jobs by number, name or address…" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map(j => (
            <button key={j.id} type="button" onClick={() => { onPick(j); setQ(''); setResults([]) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
              <p className="font-medium text-gray-900">{j.project_name}</p>
              <p className="text-xs text-gray-400">Job {j.job_number}{j.address ? ` · ${j.address}` : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SectionHeading({ letter, title, hint, right }: { letter: string; title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-900 text-white text-[10px] mr-2">{letter}</span>{title}
        </p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {right}
    </div>
  )
}

export function ModalFrame({ title, subtitle, onClose, children, footer, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className={`bg-white sm:rounded-2xl rounded-t-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[94vh] sm:max-h-[88vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">{title}</div>
            {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0 ml-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 sm:px-5 py-4">{children}</div>
        {footer && <div className="px-4 sm:px-5 py-3 border-t border-gray-100 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
