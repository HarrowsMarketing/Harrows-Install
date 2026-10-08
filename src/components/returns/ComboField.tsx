import { useState } from 'react'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  addLabel?: string
  placeholder?: string
  prominent?: boolean
}

// A dropdown of remembered values with an "Add new…" escape hatch. Whatever is typed is
// saved on the next section save — the API appends it to the remembered list, so it's in
// the dropdown next time for everyone.
export default function ComboField({ label, value, onChange, options, addLabel = '+ Add new…', placeholder, prominent }: Props) {
  const inList = !value || options.some(o => o.toLowerCase() === value.toLowerCase())
  const [adding, setAdding] = useState(!inList)
  const all = inList || !value ? options : [...options, value]

  return (
    <label className="block">
      <span className={`text-xs font-semibold uppercase tracking-wide ${prominent ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
      {adding ? (
        <div className="mt-1 flex gap-2">
          <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Type a new one…'}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <button type="button" onClick={() => { setAdding(false); if (!inList) onChange('') }}
            className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 shrink-0">List</button>
        </div>
      ) : (
        <select value={value} onChange={e => { if (e.target.value === '__add__') { onChange(''); setAdding(true) } else onChange(e.target.value) }}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">—</option>
          {all.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__add__">{addLabel}</option>
        </select>
      )}
    </label>
  )
}
