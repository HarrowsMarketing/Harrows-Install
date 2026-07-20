import { useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { getAuthHeaders } from '../lib/api'

interface Props {
  reportKey: string // a client-generated id used to namespace this report's photo pathnames before the report itself has an id
  pathnames: string[]
  onChange: (pathnames: string[]) => void
}

const MAX_PHOTO_EDGE = 2000 // phone camera photos are easily 5-10MB+ (sometimes HEIC) —
// downscale and re-encode to JPEG before upload, or a large multipart upload over a
// mobile connection can fail outright ("Failed to fetch") instead of just being slow.

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function resizeForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const dataUrl = await readAsDataUrl(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpegBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!jpegBlob) return file
    const newName = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([jpegBlob], newName, { type: 'image/jpeg' })
  } catch {
    // If decoding fails for any reason (e.g. a format the browser can't read), fall back
    // to the original file rather than blocking the upload entirely.
    return file
  }
}

export default function PhotoUpload({ reportKey, pathnames, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    // input.files is a live reference — the caller resets input.value right after calling
    // this, which clears it. Snapshot the files synchronously now, before any `await`
    // below yields and lets that reset run first (it did: this was silently dropping every
    // upload after the auth-header fix added an earlier await ahead of this loop).
    const fileArray = Array.from(files)
    setUploading(true)
    setError('')
    try {
      // upload() makes its own fetch() calls to handleUploadUrl — it never goes through
      // the axios interceptor in lib/api.ts, so the auth header has to be passed explicitly
      // or requireInstallerOrAdmin rejects the token request with a 401.
      const headers = await getAuthHeaders()
      const newPathnames: string[] = []
      for (const original of fileArray) {
        const file = await resizeForUpload(original)
        const pathname = `install/${reportKey}/${Date.now()}-${file.name}`
        const blob = await upload(pathname, file, {
          access: 'private',
          handleUploadUrl: '/api/install/photos/upload-token',
          multipart: true,
          headers,
        })
        newPathnames.push(blob.pathname)
      }
      onChange([...pathnames, ...newPathnames])
    } catch (e: any) {
      setError(e.message || 'Photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeAt = (i: number) => onChange(pathnames.filter((_, idx) => idx !== i))

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-lg py-6 text-gray-500 hover:border-gray-300 disabled:opacity-50 transition-colors"
        >
          <CameraIcon />
          <span className="text-sm">Camera</span>
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-lg py-6 text-gray-500 hover:border-gray-300 disabled:opacity-50 transition-colors"
        >
          <GalleryIcon />
          <span className="text-sm">Gallery</span>
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />

      {uploading && <p className="text-xs text-gray-400 mt-2">Uploading...</p>}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {pathnames.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {pathnames.map((p, i) => (
            <div key={p} className="relative bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600">
              {p.split('/').pop()}
              <button type="button" onClick={() => removeAt(i)} className="ml-2 text-gray-400 hover:text-red-500">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function GalleryIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h16M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
    </svg>
  )
}
