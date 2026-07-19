import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import axios from 'axios'
import type { EodReport } from '../types'

const PW = 210, PH = 297, M = 14, CW = 182
const BRAND: [number, number, number] = [30, 41, 59]
const GRAY: [number, number, number] = [107, 114, 128]
const SLATE: [number, number, number] = [71, 85, 105]
const LIGHT: [number, number, number] = [249, 250, 251]

function checkPage(doc: jsPDF, y: number, needed = 30): number {
  if (y + needed > PH - 16) { doc.addPage(); return 18 }
  return y
}
function sectionLabel(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...GRAY)
  doc.text(text.toUpperCase(), M, y)
  doc.setTextColor(0)
  return y + 4
}
function bodyText(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(30, 30, 30)
  const lines = doc.splitTextToSize(text, CW)
  doc.text(lines, M, y)
  doc.setTextColor(0)
  return y + lines.length * 4.2 + 4
}
function statCards(doc: jsPDF, y: number, cards: { label: string; value: string }[]): number {
  const n = cards.length, gap = 3, h = 18
  const w = (CW - gap * (n - 1)) / n
  cards.forEach((card, i) => {
    const x = M + i * (w + gap)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
    doc.setDrawColor(0)
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...BRAND)
    doc.text(card.value, x + w / 2, y + 8, { align: 'center' })
    doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(...SLATE)
    doc.text(card.label, x + w / 2, y + 13, { align: 'center' })
  })
  doc.setTextColor(0)
  return y + h + 6
}
function photoImage(doc: jsPDF, imgData: string, y: number, h = 55): number {
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(M, y, CW, h, 2, 2, 'FD')
  doc.setDrawColor(0)
  const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG'
  try { doc.addImage(imgData, format, M + 2, y + 2, CW - 4, h - 4) } catch { /* skip an image that fails to decode */ }
  return y + h + 6
}

async function fetchAsDataUrl(pathname: string): Promise<string | null> {
  try {
    const r = await axios.get('/api/install/photos/url', { params: { pathname } })
    const imgResp = await fetch(r.data.url)
    const blob = await imgResp.blob()
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

export async function generateReportPDF(report: EodReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const dateStr = new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, PW, 26, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(255, 255, 255)
  doc.text('Harrows Install Report', M, 11)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(report.job?.project_name || 'Job', M, 19)
  doc.setTextColor(180, 180, 180).setFont('helvetica', 'normal').setFontSize(8)
  doc.text(dateStr, PW - M, 19, { align: 'right' })
  doc.setTextColor(0)

  let y = 34
  y = sectionLabel(doc, 'Job', y)
  y = statCards(doc, y, [
    { label: 'Job Number', value: report.job?.job_number || '—' },
    { label: 'Installer', value: report.installer?.name || '—' },
    { label: 'Work Completed', value: `${report.percent_complete}%` },
  ])
  if (report.job?.address) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRAY)
    doc.text(report.job.address, M, y)
    doc.setTextColor(0)
    y += 8
  }

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
      headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3 },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: M, right: M },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (report.additional_notes) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Additional notes', y)
    y = bodyText(doc, report.additional_notes, y)
  }

  if (report.photos?.length) {
    for (const photo of report.photos) {
      y = checkPage(doc, y, 60)
      const dataUrl = await fetchAsDataUrl(photo.blob_pathname)
      if (dataUrl) y = photoImage(doc, dataUrl, y)
    }
  }

  const pages = (doc as any).getNumberOfPages?.() ?? 1
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7).setTextColor(...GRAY)
    doc.text(`Harrows Install · installs.harrows.co.nz · Page ${i} of ${pages}`, PW / 2, PH - 7, { align: 'center' })
  }

  doc.save(`eod-${report.job?.job_number || 'report'}-${report.report_date}.pdf`)
}
