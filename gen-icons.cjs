// Regenerates public/pwa-192.png, public/pwa-512.png and public/apple-touch-icon.png
// from Harrows_Logo2023_Icon_Charcoal_R_RGB.png, recolored to brand yellow (#EBA117)
// and cropped to exclude the master file's (R) mark (which sits outside the H's own
// bounding box, top-right) so the icon is centered. Re-run with `node gen-icons.cjs`
// after changing the source logo. Same approach as the main Harrows-dashboard repo.
const sharp = require('sharp')
const path = require('path')

const SRC = path.join(__dirname, 'public', 'Harrows_Logo2023_Icon_Charcoal_R_RGB.png')
const BRAND_YELLOW = { r: 0xeb, g: 0xa1, b: 0x17 }
const DARK_THRESHOLD = 128 // luminance below this = "ink" (the H), above = background

async function main() {
  const img = sharp(SRC)
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  // Find the H's bounding box, ignoring the isolated (R) mark in the top-right corner.
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRMarkZone = x > width * 0.9 && y < height * 0.15
      if (inRMarkZone) continue
      const i = (y * width + x) * channels
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (luminance < DARK_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Recolor: ink -> brand yellow, everything else -> white
  const recolored = Buffer.alloc(width * height * channels)
  for (let p = 0; p < width * height; p++) {
    const i = p * channels
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3
    const isInk = luminance < DARK_THRESHOLD
    recolored[i] = isInk ? BRAND_YELLOW.r : 255
    recolored[i + 1] = isInk ? BRAND_YELLOW.g : 255
    recolored[i + 2] = isInk ? BRAND_YELLOW.b : 255
    recolored[i + 3] = 255
  }

  const cropW = maxX - minX
  const cropH = maxY - minY
  const cropped = sharp(recolored, { raw: { width, height, channels } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })

  async function makeIcon(size, outFile) {
    const padding = Math.round(size * 0.18) // safe-zone padding for maskable icons
    const inner = size - padding * 2
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{
        input: await cropped.clone().resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer(),
        gravity: 'center',
      }])
      .png()
      .toFile(path.join(__dirname, 'public', outFile))
    console.log(`wrote ${outFile} (${size}x${size})`)
  }

  await makeIcon(192, 'pwa-192.png')
  await makeIcon(512, 'pwa-512.png')
  await makeIcon(180, 'apple-touch-icon.png')
}

main().catch(err => { console.error(err); process.exit(1) })
