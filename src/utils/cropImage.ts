export interface CropPixels {
  x: number
  y: number
  width: number
  height: number
}

const MAX_CROP_EDGE = 800 // profile photos are small/circular in the UI — no need for 2000px source resolution

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Cuts the user's chosen crop rectangle out of the source image and re-encodes it as a
// fixed-size square JPEG — output is already sized/compressed, so callers don't need to
// separately run resizeForUpload on the result.
export async function getCroppedFile(imageSrc: string, cropPixels: CropPixels, fileName: string): Promise<File> {
  const img = await loadImage(imageSrc)
  const outputEdge = Math.min(MAX_CROP_EDGE, Math.max(cropPixels.width, cropPixels.height))
  const canvas = document.createElement('canvas')
  canvas.width = outputEdge
  canvas.height = outputEdge
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(
    img,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, outputEdge, outputEdge
  )
  const jpegBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!jpegBlob) throw new Error('Failed to encode cropped image')
  const newName = fileName.replace(/\.\w+$/, '') + '.jpg'
  return new File([jpegBlob], newName, { type: 'image/jpeg' })
}
