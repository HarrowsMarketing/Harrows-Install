import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import axios from 'axios'
import type { EodReport } from '../types'

// Styled to match Harrows' actual factory job card stationery (see reference PDF Rocky
// supplied) — plain white background, just the logo up top (no letterhead address block),
// no filled colour blocks, thin grey rules instead of cards/shading.
const PW = 210, PH = 297, M = 14, CW = 182
const INK: [number, number, number] = [17, 24, 39]
const MUTED: [number, number, number] = [107, 114, 128]
const LINE: [number, number, number] = [209, 213, 219]
const HEADER_FILL: [number, number, number] = [245, 245, 246]
const RED: [number, number, number] = [185, 28, 28]
const RED_FILL: [number, number, number] = [254, 242, 242]

const LOGO_SRC = '/Harrows_Logo2023_Wordmark_Charcoal_R_RGB.jpg'
const LOGO_ASPECT = 1241 / 6250 // native pixel dimensions of the wordmark asset

type Variant = 'job' | 'internal'

function checkPage(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > PH - 22) { doc.addPage(); return 22 }
  return y
}
function sectionLabel(doc: jsPDF, text: string, y: number, color: [number, number, number] = INK): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...color)
  doc.text(text.toUpperCase(), M, y, { charSpace: 0.3 })
  doc.setTextColor(0)
  return y + 4.5
}
function bodyText(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
  const lines = doc.splitTextToSize(text, CW)
  doc.text(lines, M, y)
  doc.setTextColor(0)
  return y + lines.length * 4.2 + 4
}

const FIELD_COL_X = M + 95

function jobColumn(doc: jsPDF, y: number, report: EodReport): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0)
  doc.text(report.job?.project_name || 'Job', M, y)
  let ly = y + 5
  if (report.job?.job_number) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    doc.text(`Job ${report.job.job_number}`, M, ly)
    ly += 4.5
  }
  if (report.job?.address) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    const lines = doc.splitTextToSize(report.job.address, 78)
    doc.text(lines, M, ly)
    ly += lines.length * 4.2
  }
  doc.setTextColor(0)
  return ly
}

function fieldColumn(doc: jsPDF, y: number, rows: { label: string; value: string }[]): number {
  const labelW = 32
  let fy = y
  rows.forEach(row => {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(0)
    doc.text(row.label, FIELD_COL_X, fy)
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK)
    doc.text(`: ${row.value}`, FIELD_COL_X + labelW, fy)
    fy += 5
  })
  doc.setTextColor(0)
  return fy
}

function photoImage(doc: jsPDF, imgData: string, y: number, borderColor: [number, number, number] = LINE, maxH = 90): number {
  // Fit the image within the box preserving its own aspect ratio instead of stretching
  // it to a fixed box — a portrait phone photo forced into a wide fixed box came out
  // squished.
  const maxW = CW - 4
  let w = maxW, h = maxH
  try {
    const props = doc.getImageProperties(imgData)
    const scale = Math.min(maxW / props.width, maxH / props.height)
    w = props.width * scale
    h = props.height * scale
  } catch { /* fall through with the box maxed out if properties can't be read */ }

  const boxH = h + 4
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(borderColor === LINE ? 0.2 : 0.6)
  doc.rect(M, y, CW, boxH, 'S')
  doc.setDrawColor(0)
  const x = M + (CW - w) / 2
  const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG'
  try { doc.addImage(imgData, format, x, y + 2, w, h) } catch { /* skip an image that fails to decode */ }
  return y + boxH + 6
}

// A red-bordered box around internal-only text — the on-screen "internal" red box carried
// through into the PDF so it stays just as obvious on paper.
function internalNoteBox(doc: jsPDF, text: string, y: number): number {
  const padding = 3
  doc.setFont('helvetica', 'normal').setFontSize(9)
  const lines = doc.splitTextToSize(text, CW - padding * 2)
  const boxH = lines.length * 4.2 + padding * 2
  doc.setFillColor(...RED_FILL)
  doc.setDrawColor(...RED)
  doc.setLineWidth(0.5)
  doc.rect(M, y, CW, boxH, 'FD')
  doc.setTextColor(...INK)
  doc.text(lines, M + padding, y + padding + 3)
  doc.setDrawColor(0).setTextColor(0).setFillColor(255, 255, 255)
  return y + boxH + 6
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// jsPDF's own path-clipping API is finicky across versions, so the circular crop is done
// on a <canvas> first (same approach as resizeImage.ts) — the result is a plain PNG with
// transparent corners that addImage() can drop straight onto the page, no PDF-level clip needed.
async function circularAvatarDataUrl(dataUrl: string, size = 96): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    const scale = Math.max(size / img.width, size / img.height) // cover-fit, center-cropped
    const w = img.width * scale, h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function drawAvatar(doc: jsPDF, imgData: string, cx: number, cy: number, r: number) {
  try { doc.addImage(imgData, 'PNG', cx - r, cy - r, r * 2, r * 2) } catch { /* skip an image that fails to decode */ }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function fetchPhotoAsDataUrl(pathname: string): Promise<string | null> {
  try {
    const r = await axios.get('/api/install/photos/url', { params: { pathname } })
    return await fetchAsDataUrl(r.data.url)
  } catch {
    return null
  }
}

function pdfFilename(report: EodReport, variant: Variant) {
  const suffix = variant === 'internal' ? '-internal' : ''
  return `eod-${report.job?.job_number || 'report'}-${report.report_date}${suffix}.pdf`
}

async function drawHeader(doc: jsPDF, report: EodReport, variant: Variant): Promise<number> {
  const title = variant === 'internal' ? 'INTERNAL REPORT' : 'EOD Report'
  const titleColor = variant === 'internal' ? RED : INK
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...titleColor)
  doc.text(title, M, 16, { charSpace: 0.7 })
  doc.setTextColor(0)

  const logoData = await fetchAsDataUrl(LOGO_SRC)
  const logoW = 42
  const logoH = logoW * LOGO_ASPECT
  if (logoData) {
    try { doc.addImage(logoData, 'JPEG', PW - M - logoW, 8, logoW, logoH) } catch { /* skip if it fails to decode */ }
  }

  const dateStr = new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text(dateStr, M, 22)
  doc.setTextColor(0)

  return Math.max(30, 8 + logoH + 4)
}

function drawContinuationHeader(doc: jsPDF, report: EodReport, variant: Variant, pageNum: number) {
  const label = variant === 'internal' ? 'INTERNAL REPORT' : 'EOD Report'
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
  doc.text(`${label} — ${report.job?.project_name || 'Job'}`, M, 12)
  doc.text(`Page ${pageNum}`, PW - M, 12, { align: 'right' })
  doc.setDrawColor(...LINE).setLineWidth(0.2)
  doc.line(M, 15, PW - M, 15)
  doc.setDrawColor(0).setTextColor(0)
}

// Printed at the bottom of every page of the client-facing job report — the internal
// report doesn't need it, since it's never seen by the client.
function drawFooter(doc: jsPDF, defectsNoticeText: string) {
  if (!defectsNoticeText) return
  doc.setDrawColor(...LINE).setLineWidth(0.2)
  doc.line(M, PH - 18, PW - M, PH - 18)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED)
  const lines = doc.splitTextToSize(defectsNoticeText, CW)
  doc.text(lines, M, PH - 14)
  doc.setTextColor(0)
}

async function buildReportPDF(report: EodReport, variant: Variant, defectsNoticeText: string): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = await drawHeader(doc, report, variant)

  const leftEnd = jobColumn(doc, y, report)
  const rightEnd = fieldColumn(doc, y, [
    { label: 'Installer', value: report.installer?.name || '—' },
    { label: 'Work Completed', value: `${report.percent_complete}%` },
    { label: 'Processed', value: report.email_sent ? 'Yes' : 'No' },
  ])
  if (report.installer?.photo_pathname) {
    const raw = await fetchPhotoAsDataUrl(report.installer.photo_pathname)
    const avatar = raw && await circularAvatarDataUrl(raw)
    if (avatar) drawAvatar(doc, avatar, FIELD_COL_X - 7, y - 1.3, 3.2)
  }
  y = Math.max(leftEnd, rightEnd) + 6
  doc.setDrawColor(...LINE).setLineWidth(0.2)
  doc.line(M, y, PW - M, y)
  doc.setDrawColor(0)
  y += 7

  y = checkPage(doc, y, 30)
  y = sectionLabel(doc, 'Work completed today', y)
  y = bodyText(doc, report.work_done, y)

  if (report.work_scheduled_tomorrow) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Work scheduled for tomorrow', y)
    y = bodyText(doc, report.work_scheduled_tomorrow, y)
  }

  if (report.products) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Products', y)
    y = bodyText(doc, report.products, y)
  }

  if (report.issues || report.solutions) {
    y = checkPage(doc, y, 30)
    y = sectionLabel(doc, 'Issues & Solutions', y)
    autoTable(doc, {
      startY: y,
      head: [['Issues', 'Solutions']],
      body: [[report.issues || '—', report.solutions || '—']],
      theme: 'grid',
      headStyles: { fillColor: HEADER_FILL, textColor: INK, fontStyle: 'bold', fontSize: 8, lineColor: LINE, lineWidth: 0.2 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      margin: { left: M, right: M },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (report.additional_notes) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Additional notes', y)
    y = bodyText(doc, report.additional_notes, y)
  }

  const clientPhotos = report.photos?.filter(p => !p.is_internal) ?? []
  if (clientPhotos.length) {
    y = checkPage(doc, y, 20)
    y = sectionLabel(doc, 'End of day photos', y)
    for (const photo of clientPhotos) {
      y = checkPage(doc, y, 100)
      const dataUrl = await fetchPhotoAsDataUrl(photo.blob_pathname)
      if (dataUrl) y = photoImage(doc, dataUrl, y)
    }
  }

  if (variant === 'internal') {
    const internalPhotos = report.photos?.filter(p => p.is_internal) ?? []
    if (report.internal_notes || internalPhotos.length) {
      y = checkPage(doc, y, 20)
      y = sectionLabel(doc, 'Internal notes & photos — not for client', y, RED)
      if (report.internal_notes) y = internalNoteBox(doc, report.internal_notes, y)
      for (const photo of internalPhotos) {
        y = checkPage(doc, y, 100)
        const dataUrl = await fetchPhotoAsDataUrl(photo.blob_pathname)
        if (dataUrl) y = photoImage(doc, dataUrl, y, RED)
      }
    }
  }

  const pages = (doc as any).getNumberOfPages?.() ?? 1
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    if (i > 1) drawContinuationHeader(doc, report, variant, i)
    if (variant === 'job') drawFooter(doc, defectsNoticeText)
  }

  return doc
}

export async function generateJobReportPDF(report: EodReport, defectsNoticeText: string) {
  const doc = await buildReportPDF(report, 'job', defectsNoticeText)
  doc.save(pdfFilename(report, 'job'))
}

export async function generateInternalReportPDF(report: EodReport) {
  const doc = await buildReportPDF(report, 'internal', '')
  doc.save(pdfFilename(report, 'internal'))
}
