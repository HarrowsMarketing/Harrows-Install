// Regenerates public/pwa-192.png, public/pwa-512.png and public/apple-touch-icon.png
// from Harrows_Icon_Hardhat.png (charcoal H + yellow hard hat). Cropped to the full
// visible content (so the hat doesn't get clipped), but centered on the H's own
// midpoint rather than the combined H+hat bounding box — the hat hangs off to the
// right, so centering the combined box visually skews the H left of center. The H's
// own bounding box is computed from the plain (no-hat) master logo, which shares the
// same canvas size/position, since the hat's dark outline strokes overlap the H's own
// charcoal color too much to separate reliably by color within the composite itself.
// Re-run with `node gen-icons.cjs` after changing either source logo.
const sharp = require('sharp')
const path = require('path')

const HARDHAT_SRC = path.join(__dirname, 'public', 'Harrows_Icon_Hardhat.png')
const PLAIN_SRC = path.join(__dirname, 'public', 'Harrows_Logo2023_Icon_Charcoal_R_RGB.png')

function boundingBox(data, width, height, channels, isForeground) {
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (isForeground(x, y, data, i)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

async function main() {
  const hardhat = await sharp(HARDHAT_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const plain = await sharp(PLAIN_SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = hardhat.info
  if (plain.info.width !== width || plain.info.height !== height) {
    throw new Error('Source logos have different dimensions — H bbox from the plain logo would not align')
  }

  const isVisible = (x, y, d, i) => d[i + 3] > 10 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)
  const isHOnPlain = (x, y, d, i) => {
    const inRMarkZone = x > width * 0.9 && y < height * 0.15
    if (inRMarkZone) return false
    return (d[i] + d[i + 1] + d[i + 2]) / 3 < 128
  }

  const fullBox = boundingBox(hardhat.data, width, height, channels, isVisible)
  const hBox = boundingBox(plain.data, width, height, channels, isHOnPlain)
  const hCenterX = (hBox.minX + hBox.maxX) / 2
  const hCenterY = (hBox.minY + hBox.maxY) / 2

  const cropW = fullBox.maxX - fullBox.minX
  const cropH = fullBox.maxY - fullBox.minY
  const cropped = sharp(HARDHAT_SRC).extract({ left: fullBox.minX, top: fullBox.minY, width: cropW, height: cropH })

  async function makeIcon(size, outFile) {
    const padding = Math.round(size * 0.27)
    const inner = size - padding * 2
    const scale = Math.min(inner / cropW, inner / cropH)
    const resizedW = Math.round(cropW * scale)
    const resizedH = Math.round(cropH * scale)

    // H's center, mapped from original image space -> cropped space -> resized space
    const hCenterXResized = (hCenterX - fullBox.minX) * scale
    const hCenterYResized = (hCenterY - fullBox.minY) * scale
    const left = Math.round(size / 2 - hCenterXResized)
    const top = Math.round(size / 2 - hCenterYResized)

    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{
        input: await cropped.clone().resize({ width: resizedW, height: resizedH }).png().toBuffer(),
        left, top,
      }])
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(path.join(__dirname, 'public', outFile))
    console.log(`wrote ${outFile} (${size}x${size})`)
  }

  await makeIcon(192, 'pwa-192.png')
  await makeIcon(512, 'pwa-512.png')
  await makeIcon(180, 'apple-touch-icon.png')
}

main().catch(err => { console.error(err); process.exit(1) })
