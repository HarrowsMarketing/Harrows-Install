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

export async function resizeForUpload(file: File, maxEdge = MAX_PHOTO_EDGE): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const dataUrl = await readAsDataUrl(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
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
