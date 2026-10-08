import { useMemo, useRef, useState } from 'react'
import axios from 'axios'
import type { ReturnMatch, ReturnRecord } from '../../types'
import { fmtDate, priorityBadge, priorityLabel, returnMatchesSearch, todayNZ, firstSitePhoto } from '../../lib/returns'
import { resizeForUpload } from '../../utils/resizeImage'
import { uploadPhotoFile } from '../PhotoUpload'
import { ModalFrame } from './fields'
import { PhotoThumb } from './ReturnPhotoGrid'

interface Props {
  candidates: ReturnRecord[] // in-progress returns not yet received
  onClose: () => void
  onReceived: (returnId: string) => void
}

type Step = 'capture' | 'matching' | 'results' | 'search' | 'confirming'

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Factory floor flow: photograph what's arrived, let the AI suggest which open return it
// is, user confirms (always — nothing auto-assigns), then the return is marked received
// with that photo saved as a factory photo.
export default function ReceiveItemModal({ candidates, onClose, onReceived }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [matches, setMatches] = useState<ReturnMatch[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const searchResults = useMemo(() => candidates.filter(r => returnMatchesSearch(r, q)).slice(0, 30), [candidates, q])

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    setError('')
    setStep('matching')
    try {
      const resized = await resizeForUpload(f, 1400)
      setFile(resized)
      const dataUrl = await readAsDataUrl(resized)
      setPreview(dataUrl)
      const r = await axios.post('/api/install/returns/match', { mediaType: resized.type || 'image/jpeg', data: dataUrl.split(',')[1] })
      setMatches(r.data.matches)
      setCandidateCount(r.data.candidateCount)
      setStep('results')
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Photo matching failed')
      setStep('results')
      setMatches([])
    }
  }

  const confirm = async (ret: ReturnRecord) => {
    if (!window.confirm(`Receive ${ret.return_number} — Job ${ret.original_job_number} ${ret.original_job_name}?`)) return
    setStep('confirming')
    setError('')
    try {
      if (file) {
        const pathname = await uploadPhotoFile(file, `returns/${ret.id}/factory`)
        await axios.post(`/api/install/returns/${ret.id}/photos`, { kind: 'factory', pathnames: [pathname] })
      }
      if (!ret.date_received) await axios.patch(`/api/install/returns/${ret.id}`, { date_received: todayNZ() })
      onReceived(ret.id)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not mark this as received')
      setStep(matches.length ? 'results' : 'search')
    }
  }

  const Candidate = ({ r, confidence, reason }: { r: ReturnRecord; confidence?: number; reason?: string }) => {
    const photo = firstSitePhoto(r)
    return (
      <button type="button" onClick={() => confirm(r)} className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 flex gap-3 hover:border-harrows-yellow transition-colors">
        <PhotoThumb pathname={photo?.blob_pathname ?? null} url={photo?.url} className="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold bg-gray-900 text-white px-2 py-0.5 rounded">{r.return_number}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${priorityBadge(r.priority)}`}>{priorityLabel(r.priority)}</span>
            {confidence !== undefined && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${confidence >= 70 ? 'bg-green-100 text-green-700' : confidence >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{confidence}% match</span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 truncate mt-1"><span className="font-mono text-xs text-gray-500 mr-1.5">JOB {r.original_job_number}</span>{r.original_job_name}</p>
          <p className="text-xs text-gray-500 truncate">{r.items[0]?.description || r.reason}{r.estimated_arrival_date ? ` · ETA ${fmtDate(r.estimated_arrival_date)}` : ''}{r.freight_docket ? ` · Docket ${r.freight_docket}` : ''}</p>
          {reason && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{reason}</p>}
        </div>
      </button>
    )
  }

  return (
    <ModalFrame title="Receive an item" subtitle="Photograph what's arrived and confirm which return it belongs to." onClose={onClose}>
      {step === 'capture' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => cameraRef.current?.click()} className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-8 text-gray-600 hover:border-harrows-yellow">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-sm font-semibold">Take a photo</span>
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 text-gray-500 hover:border-gray-300">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h16M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
              <span className="text-sm">From gallery</span>
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          <p className="text-xs text-gray-400">The photo is compared against the site photos of every return still on its way here. You always confirm the match — nothing is assigned automatically.</p>
          <button type="button" onClick={() => setStep('search')} className="w-full py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Not listed / search manually</button>
        </div>
      )}

      {step === 'matching' && (
        <div className="text-center py-8 space-y-3">
          {preview && <img src={preview} className="w-32 h-32 object-cover rounded-xl mx-auto border border-gray-200" alt="" />}
          <p className="text-sm font-medium text-gray-800">Comparing against open returns…</p>
          <p className="text-xs text-gray-400">This usually takes 10–20 seconds.</p>
        </div>
      )}

      {step === 'confirming' && (
        <div className="text-center py-8"><p className="text-sm font-medium text-gray-800">Saving photo and marking as received…</p></div>
      )}

      {step === 'results' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {preview && <img src={preview} className="w-16 h-16 object-cover rounded-lg border border-gray-200" alt="" />}
            <div className="text-xs text-gray-500">
              {error ? <p className="text-red-500">{error}</p> : matches.length
                ? <p>Top {matches.length} likely match{matches.length > 1 ? 'es' : ''} out of {candidateCount} open return{candidateCount !== 1 ? 's' : ''} with site photos. Tap the right one to confirm.</p>
                : <p>No likely match among {candidateCount} open return{candidateCount !== 1 ? 's' : ''} with site photos.</p>}
            </div>
          </div>
          {matches.map(m => <Candidate key={m.return.id} r={m.return} confidence={m.confidence} reason={m.reason} />)}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setStep('capture')} className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Retake</button>
            <button type="button" onClick={() => setStep('search')} className="flex-1 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700">Not listed / search manually</button>
          </div>
        </div>
      )}

      {step === 'search' && (
        <div className="space-y-3">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Job number, job name, docket or return number…" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          {searchResults.length === 0 ? <p className="text-xs text-gray-400">No open returns match.</p> : searchResults.map(r => <Candidate key={r.id} r={r} />)}
          {file && <p className="text-[11px] text-gray-400">The photo you took will be saved as the factory photo on whichever return you pick.</p>}
          <button type="button" onClick={() => setStep('capture')} className="text-xs text-gray-500 underline">Back to photo</button>
        </div>
      )}
    </ModalFrame>
  )
}
