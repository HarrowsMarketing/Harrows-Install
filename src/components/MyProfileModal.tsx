import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { upload } from '@vercel/blob/client'
import { getAuthHeaders } from '../lib/api'
import { setInstallerSession, type InstallerInfo } from '../utils/installerSession'
import PhotoCropModal from './PhotoCropModal'

interface Props {
  installer: InstallerInfo
  onClose: () => void
  onUpdated: (installer: InstallerInfo) => void
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

export default function MyProfileModal({ installer, onClose, onUpdated }: Props) {
  const [name, setName] = useState(installer.name)
  const [phone, setPhone] = useState(installer.phone || '')
  const [photoPathname, setPhotoPathname] = useState(installer.photoPathname)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cropFile, setCropFile] = useState<{ file: File; src: string } | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    axios.get('/api/install/me').then(r => {
      const me = r.data.installer
      setName(me.name)
      setPhone(me.phone || '')
      setPhotoPathname(me.photo_pathname)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!photoPathname) { setPhotoUrl(null); return }
    axios.get('/api/install/photos/url', { params: { pathname: photoPathname } })
      .then(r => setPhotoUrl(r.data.url))
      .catch(() => {})
  }, [photoPathname])

  const handlePhoto = (files: FileList | null) => {
    if (!files || !files.length) return
    const file = files[0] // snapshot before any await — see PhotoUpload.tsx for why
    setCropFile({ file, src: URL.createObjectURL(file) })
  }

  const uploadCropped = async (cropped: File) => {
    setCropFile(null)
    setUploadingPhoto(true)
    setError('')
    try {
      // getCroppedFile already downsizes/re-encodes to JPEG, so no separate resize step needed.
      const headers = await getAuthHeaders()
      const pathname = `install/profile/${installer.id}/${Date.now()}-${cropped.name}`
      const blob = await upload(pathname, cropped, {
        access: 'private',
        handleUploadUrl: '/api/install/photos/upload-token',
        multipart: true,
        headers,
      })
      setPhotoPathname(blob.pathname)
    } catch (e: any) {
      setError(e.message || 'Photo upload failed')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const save = async () => {
    if (!name.trim()) return setError('Name is required')
    setSaving(true)
    setError('')
    try {
      await axios.patch('/api/install/me', { name: name.trim(), phone: phone.trim() || null, photoPathname })
      const updated: InstallerInfo = { ...installer, name: name.trim(), phone: phone.trim() || null, photoPathname }
      const token = localStorage.getItem('eod:installerToken')
      if (token) setInstallerSession(token, updated)
      onUpdated(updated)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-base font-bold text-gray-900">My Profile</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={uploadingPhoto}
                className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-900 text-white flex items-center justify-center text-lg font-semibold shrink-0 disabled:opacity-50"
              >
                {photoUrl ? <img src={photoUrl} className="w-full h-full object-cover" /> : initials(name || '?')}
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploadingPhoto}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 disabled:opacity-50 transition-colors">
                  Take photo
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploadingPhoto}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 disabled:opacity-50 transition-colors">
                  Choose photo
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
                onChange={e => { handlePhoto(e.target.files); e.target.value = '' }} />
              <input ref={galleryRef} type="file" accept="image/*" className="hidden"
                onChange={e => { handlePhoto(e.target.files); e.target.value = '' }} />
              {uploadingPhoto && <p className="text-xs text-gray-400">Uploading...</p>}
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Work phone / contact number</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Seen by admin"
                inputMode="tel"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={save} disabled={saving || uploadingPhoto}
              className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      {cropFile && (
        <PhotoCropModal
          file={cropFile.file}
          imageSrc={cropFile.src}
          onCancel={() => { URL.revokeObjectURL(cropFile.src); setCropFile(null) }}
          onCropped={cropped => { URL.revokeObjectURL(cropFile.src); uploadCropped(cropped) }}
        />
      )}
    </div>
  )
}
