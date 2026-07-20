import { useRef, useState } from 'react'
import axios from 'axios'
import type { JobCard } from '../types'

const emptyForm = {
  jobNumber: '', projectName: '', address: '',
  billingCompany: '', invoiceTo: '', invoicePhone: '', invoiceEmail: '',
  pmName: '', pmPhone: '', pmEmail: '',
  salespersonName: '', salespersonEmail: '',
}

type Form = typeof emptyForm

function fromJob(job: JobCard): Form {
  return {
    jobNumber: job.job_number, projectName: job.project_name, address: job.address || '',
    billingCompany: job.billing_company || '', invoiceTo: job.invoice_to || '',
    invoicePhone: job.invoice_phone || '', invoiceEmail: job.invoice_email || '',
    pmName: job.pm_name || '', pmPhone: job.pm_phone || '', pmEmail: job.pm_email || '',
    salespersonName: job.salesperson_name || '', salespersonEmail: job.salesperson_email || '',
  }
}

const MAX_IMAGE_EDGE = 1600 // phone camera photos are easily 3000-4000px+ and 5-10MB — downscale before sending

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Downscales+re-encodes photos client-side so a full-res phone camera shot doesn't blow
// past the request body limit or slow the scan down. PDFs pass through unchanged.
async function fileToBase64(file: File): Promise<{ mediaType: string; data: string }> {
  if (!file.type.startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file)
    return { mediaType: file.type, data: dataUrl.split(',')[1] }
  }

  const dataUrl = await readAsDataUrl(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = dataUrl
  })

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return { mediaType: file.type, data: dataUrl.split(',')[1] }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: resizedDataUrl.split(',')[1] }
}

interface Props {
  job?: JobCard | null
  canDelete?: boolean
  onClose: () => void
  onSaved: (job: JobCard | null) => void
  onDeleted?: () => void
}

export default function JobCardModal({ job, canDelete, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState<Form>(job ? fromJob(job) : emptyForm)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const scan = async (file: File | undefined) => {
    if (!file) return
    setScanning(true)
    setError('')
    try {
      const { mediaType, data } = await fileToBase64(file)
      const r = await axios.post('/api/install/jobs/scan', { mediaType, data })
      setForm(f => ({ ...f, ...r.data.fields }))
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not read this file — enter details manually')
    } finally {
      setScanning(false)
    }
  }

  const save = async () => {
    if (!form.jobNumber.trim() || !form.projectName.trim()) return setError('Job number and project name are required')
    setSaving(true)
    setError('')
    try {
      if (job) {
        await axios.patch(`/api/install/jobs/${job.id}`, form)
        onSaved(null)
      } else {
        const r = await axios.post('/api/install/jobs', form)
        onSaved(r.data.job)
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save job card')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!job || !confirm('Remove this job card?')) return
    await axios.delete(`/api/install/jobs/${job.id}`)
    onDeleted?.()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <p className="text-sm font-bold text-gray-900">{job ? 'Edit job card' : 'Add job card'}</p>
          <p className="text-xs text-gray-400 mt-0.5">Take or upload a photo of the job card and the form below will be filled in automatically. Check the details before saving.</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-4 text-sm text-gray-500 hover:border-gray-300 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Reading document...' : '⬆ Upload photo or PDF of job card'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { scan(e.target.files?.[0]); e.target.value = '' }} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Job No. *" value={form.jobNumber} onChange={set('jobNumber')} />
            <Field label="Project Name *" value={form.projectName} onChange={set('projectName')} />
          </div>
          <Field label="Site Address" value={form.address} onChange={set('address')} />

          <fieldset className="border border-gray-100 rounded-lg p-3 space-y-2">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Billing Information</legend>
            <Field label="Company" value={form.billingCompany} onChange={set('billingCompany')} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice To" value={form.invoiceTo} onChange={set('invoiceTo')} />
              <Field label="Phone" value={form.invoicePhone} onChange={set('invoicePhone')} />
            </div>
            <Field label="Email" value={form.invoiceEmail} onChange={set('invoiceEmail')} />
          </fieldset>

          <fieldset className="border border-gray-100 rounded-lg p-3 space-y-2">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Project Manager</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" value={form.pmName} onChange={set('pmName')} />
              <Field label="Phone" value={form.pmPhone} onChange={set('pmPhone')} />
            </div>
            <Field label="Email" value={form.pmEmail} onChange={set('pmEmail')} />
          </fieldset>

          <fieldset className="border border-gray-100 rounded-lg p-3 space-y-2">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Salesperson</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" value={form.salespersonName} onChange={set('salespersonName')} />
              <Field label="Email" value={form.salespersonEmail} onChange={set('salespersonEmail')} />
            </div>
          </fieldset>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : job ? 'Save job card' : 'Add job card'}
          </button>
          {job && canDelete && (
            <button onClick={remove} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <input value={value} onChange={onChange}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
    </label>
  )
}
