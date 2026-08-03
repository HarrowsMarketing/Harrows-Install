import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { getCroppedFile } from '../utils/cropImage'

interface Props {
  file: File
  imageSrc: string
  onCancel: () => void
  onCropped: (file: File) => void
}

export default function PhotoCropModal({ file, imageSrc, onCancel, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!croppedAreaPixels) return
    setSaving(true)
    setError('')
    try {
      const cropped = await getCroppedFile(imageSrc, croppedAreaPixels, file.name)
      onCropped(cropped)
    } catch (e: any) {
      setError(e.message || 'Failed to crop photo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Adjust photo</h3>
        </div>

        <div className="relative w-full h-72 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Zoom</label>
            <input type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={e => setZoom(Number(e.target.value))} className="w-full accent-harrows-yellow" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving}
              className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !croppedAreaPixels}
              className="flex-1 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Use photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
