import { useState } from 'react'
import axios from 'axios'
import type { JobCard, ReturnItem, ReturnOptions, ReturnPriority, ReturnRecord } from '../../types'
import { RETURN_REASONS } from '../../lib/returns'
import PhotoUpload from '../PhotoUpload'
import ReturnPhotoGrid from './ReturnPhotoGrid'
import ComboField from './ComboField'
import { DateField, ItemsEditor, JobPicker, ModalFrame, PriorityPicker, SectionHeading, SelectField, TextArea, TextField, YesNo } from './fields'

interface Props {
  options: ReturnOptions
  onClose: () => void
  onCreated: (r: ReturnRecord) => void
}

// Only Job Information (A) and Reason (B) are needed to create a return — everything else
// is optional here and can be filled in later, by someone else, from the return itself.
export default function LogReturnModal({ options, onClose, onCreated }: Props) {
  const [photoKey] = useState(() => `returns/new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const [mode, setMode] = useState<'pick' | 'manual'>('pick')
  const [job, setJob] = useState<JobCard | null>(null)
  const [jobNumber, setJobNumber] = useState('')
  const [jobName, setJobName] = useState('')
  const [address, setAddress] = useState('')
  const [newSo, setNewSo] = useState('')
  const [requiredBy, setRequiredBy] = useState('')
  const [priority, setPriority] = useState<ReturnPriority>('normal')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [photosAttached, setPhotosAttached] = useState<boolean | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [items, setItems] = useState<ReturnItem[]>([])
  const [showFreight, setShowFreight] = useState(false)
  const [requestedBy, setRequestedBy] = useState('')
  const [freightCompany, setFreightCompany] = useState('')
  const [docket, setDocket] = useState('')
  const [pickup, setPickup] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [eta, setEta] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pickJob = (j: JobCard | null) => {
    setJob(j)
    if (j) {
      setJobNumber(j.job_number); setJobName(j.project_name); setAddress(j.address || '')
      if (!pickup) setPickup(j.address || '')
    }
  }

  const submit = async () => {
    if (!jobNumber.trim() || !jobName.trim()) return setError(mode === 'pick' && !job ? 'Pick an install job, or enter the job manually' : 'Original job number and job name are required')
    if (!reason) return setError('Pick a reason for the return')
    setSaving(true)
    setError('')
    try {
      const r = await axios.post('/api/install/returns', {
        job_id: mode === 'pick' ? job?.id || null : null,
        original_job_number: jobNumber, original_job_name: jobName, site_address: address || null,
        new_so_number: newSo || null, required_by: requiredBy || null, priority,
        reason, issue_description: description || null,
        photos_attached: photosAttached ?? (photos.length > 0 ? true : null),
        site_photos: photos,
        items,
        requested_by: requestedBy || null, freight_company: freightCompany || null, freight_docket: docket || null,
        pickup_location: pickup || address || null, expected_pickup_date: pickupDate || null, estimated_arrival_date: eta || null,
      })
      onCreated(r.data.return)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to log the return')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame title="Log a return" subtitle="Job information and reason are required — the rest can be added as it happens." onClose={onClose}
      footer={
        <div>
          {error && <p className="text-sm text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              {saving ? 'Logging…' : 'Log return'}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        <section className="space-y-3">
          <SectionHeading letter="A" title="Job information" />
          <div className="inline-flex border border-gray-200 rounded-lg p-0.5 bg-white">
            {([['pick', 'Pick an install job'], ['manual', 'Enter job manually']] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setMode(m); if (m === 'manual') setJob(null) }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'pick' && <JobPicker job={job} onPick={pickJob} />}
          {(mode === 'manual' || job) && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Original job number" value={jobNumber} onChange={setJobNumber} required />
              <TextField label="Original job name" value={jobName} onChange={setJobName} required />
            </div>
          )}
          {(mode === 'manual' || job) && <TextField label="Site address" value={address} onChange={setAddress} />}
          <div className="grid grid-cols-2 gap-3">
            <TextField label="New SO / job number" value={newSo} onChange={setNewSo} placeholder="Usually added later" />
            <DateField label="Required by / deadline" value={requiredBy} onChange={setRequiredBy} />
          </div>
          <PriorityPicker value={priority} onChange={setPriority} />
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <SectionHeading letter="B" title="Reason for return" />
          <SelectField label="Reason" value={reason} onChange={setReason} options={options.reasons?.length ? options.reasons : RETURN_REASONS} required placeholder="Pick one…" />
          <TextArea label="Description of issue" value={description} onChange={setDescription} rows={3} placeholder="What's wrong, where the damage is, what the customer said…" />
          <YesNo label="Photos attached" value={photosAttached ?? (photos.length > 0 ? true : null)} onChange={setPhotosAttached} />
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Site photos</span>
            <div className="mt-1 space-y-2">
              <PhotoUpload reportKey={photoKey} pathnames={photos} onChange={setPhotos} hideList compact />
              <ReturnPhotoGrid photos={photos.map(p => ({ key: p, pathname: p }))} onRemove={p => setPhotos(photos.filter(x => x !== p.pathname))} />
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <SectionHeading letter="C" title="Item information" hint="Up to 3 items — optional now, can be added later." />
          <ItemsEditor items={items} onChange={setItems} />
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <SectionHeading letter="D" title="Freight return" hint="Optional now — whoever books the freight can fill this in later."
            right={<button type="button" onClick={() => setShowFreight(s => !s)} className="text-xs font-semibold text-gray-700 underline shrink-0">{showFreight ? 'Hide' : 'Add now'}</button>} />
          {showFreight && (
            <div className="space-y-3">
              <ComboField label="Requested by" value={requestedBy} onChange={setRequestedBy} options={options.staff} addLabel="+ Add a new name…" />
              <ComboField label="Freight company" value={freightCompany} onChange={setFreightCompany} options={options.freightCompanies} addLabel="+ Add a new company…" />
              <TextField label="Freight docket number" value={docket} onChange={setDocket} placeholder="Leave blank if not booked yet" />
              <TextField label="Pickup location" value={pickup} onChange={setPickup} placeholder={address || 'Site address'} />
              <DateField label="Expected pickup date" value={pickupDate} onChange={setPickupDate} />
              <DateField label="Estimated arrival at factory" value={eta} onChange={setEta} prominent hint="The date everyone plans around — when it should be in Timaru." />
            </div>
          )}
        </section>
      </div>
    </ModalFrame>
  )
}
