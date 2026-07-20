// Regenerates public/pwa-192.png, public/pwa-512.png and public/apple-touch-icon.png
// from Harrows_Icon_Hardhat.png (charcoal H + yellow hard hat), auto-cropped to its
// visible content and centered on a white square. Re-run with `node gen-icons.cjs`
// after changing the source logo.
const sharp = require('sharp')
const path = require('path')

const SRC = path.join(__dirname, 'public', 'Harrows_Icon_Hardhat.png')

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  // Bounding box of visible (non-transparent, non-white) content
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const alpha = data[i + 3]
      const isWhite = data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250
      if (alpha > 10 && !isWhite) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const cropped = sharp(SRC).extract({ left: minX, top: minY, width: maxX - minX, height: maxY - minY })

  async function makeIcon(size, outFile) {
    const padding = Math.round(size * 0.1)
    const inner = size - padding * 2
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{
        input: await cropped.clone().resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer(),
        gravity: 'center',
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
