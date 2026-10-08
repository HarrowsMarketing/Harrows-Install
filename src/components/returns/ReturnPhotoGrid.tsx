import { useEffect, useState } from 'react'
import axios from 'axios'

export interface GridPhoto {
  key: string
  pathname: string
  url?: string | null
}

// Resolves a signed URL for a private Blob photo. Prefers the URL the API already
// presigned on the record; falls back to the per-photo /photos/url route otherwise.
export function usePhotoUrl(pathname: string | null | undefined, preset?: string | null) {
  const [url, setUrl] = useState<string | null>(preset ?? null)
  useEffect(() => {
    if (preset) { setUrl(preset); return }
    if (!pathname) { setUrl(null); return }
    let cancelled = false
    axios.get('/api/install/photos/url', { params: { pathname } })
      .then(r => { if (!cancelled) setUrl(r.data.url) })
      .catch(() => { if (!cancelled) setUrl(null) })
    return () => { cancelled = true }
  }, [pathname, preset])
  return url
}

export function PhotoThumb({ pathname, url, className = 'w-14 h-14', onClick }: { pathname: string | null; url?: string | null; className?: string; onClick?: () => void }) {
  const resolved = usePhotoUrl(pathname, url)
  const base = `${className} rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center`
  if (!pathname) {
    return (
      <div className={base}>
        <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h16M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>
      </div>
    )
  }
  const img = resolved ? <img src={resolved} className="w-full h-full object-cover" alt="" /> : <span className="text-[10px] text-gray-300">…</span>
  return onClick
    ? <button type="button" onClick={onClick} className={base}>{img}</button>
    : <div className={base}>{img}</div>
}

interface GridProps {
  photos: GridPhoto[]
  onRemove?: (photo: GridPhoto) => void
  emptyText?: string
}

export default function ReturnPhotoGrid({ photos, onRemove, emptyText }: GridProps) {
  const [open, setOpen] = useState<GridPhoto | null>(null)
  const openUrl = usePhotoUrl(open?.pathname, open?.url)
  if (!photos.length) return emptyText ? <p className="text-xs text-gray-400">{emptyText}</p> : null
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map(p => (
          <div key={p.key} className="relative">
            <PhotoThumb pathname={p.pathname} url={p.url} className="w-20 h-20" onClick={() => setOpen(p)} />
            {onRemove && (
              <button type="button" onClick={() => onRemove(p)} title="Remove photo"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs leading-none flex items-center justify-center shadow">
                &times;
              </button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          {openUrl ? <img src={openUrl} className="max-w-full max-h-full rounded-lg" alt="" /> : <p className="text-white text-sm">Loading…</p>}
          <button type="button" className="absolute top-3 right-4 text-white text-2xl" onClick={() => setOpen(null)}>&times;</button>
        </div>
      )}
    </>
  )
}
