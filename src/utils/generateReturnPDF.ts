import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReturnRecord } from '../types'
import { fmtDateLong, fmtDateTime, priorityLabel, statusLabel } from '../lib/returns'
import { CW, HEADER_FILL, INK, LINE, LOGO_ASPECT, LOGO_SRC, M, MUTED, PW, bodyText, checkPage, fetchAsDataUrl, fetchPhotoAsDataUrl, photoImage, sectionLabel } from './generateReportPDF'

const RED: [number, number, number] = [185, 28, 28]

// Same stationery look as the install report PDFs (generateReportPDF.ts): plain white,
// wordmark top right, thin grey rules, no filled blocks.
export async function buildReturnPDF(ret: ReturnRecord): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK)
  doc.text('Factory Return', M, 16, { charSpace: 0.7 })
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK)
  doc.text(ret.return_number, M, 23)
  const logoData = await fetchAsDataUrl(LOGO_SRC)
  const logoW = 42, logoH = logoW * LOGO_ASPECT
  if (logoData) { try { doc.addImage(logoData, 'JPEG', PW - M - logoW, 8, logoW, logoH) } catch { /* skip */ } }
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
  doc.text(`Logged ${fmtDateTime(ret.created_at)}${ret.created_by ? ` by ${ret.created_by}` : ''}`, M, 28)
  doc.setTextColor(0)

  let y = 36
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0)
  doc.text(`${ret.original_job_name}`, M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
  doc.text(`Original job ${ret.original_job_number}${ret.site_address ? ` · ${ret.site_address}` : ''}`, M, y + 4.5)
  doc.setTextColor(0)
  y += 11

  const status = `${statusLabel(ret.status)}${ret.overdue ? ' — OVERDUE' : ''}`
  autoTable(doc, {
    startY: y,
    body: [
      ['Priority', priorityLabel(ret.priority), 'Status', status],
      ['Reason', ret.reason, 'Required by', fmtDateLong(ret.required_by) || '—'],
      ['New SO / job number', ret.new_so_number || '—', 'Estimated arrival', fmtDateLong(ret.estimated_arrival_date) || '—'],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: HEADER_FILL, cellWidth: 36 }, 2: { fontStyle: 'bold', fillColor: HEADER_FILL, cellWidth: 36 } },
    margin: { left: M, right: M },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  if (ret.issue_description) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Description of issue', y)
    y = bodyText(doc, ret.issue_description, y)
  }

  if (ret.items.length) {
    y = checkPage(doc, y, 30)
    y = sectionLabel(doc, 'Items', y)
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qty', 'Action required']],
      body: ret.items.map(i => [i.description, String(i.quantity), i.action || '—']),
      theme: 'grid',
      headStyles: { fillColor: HEADER_FILL, textColor: INK, fontStyle: 'bold', fontSize: 8, lineColor: LINE, lineWidth: 0.2 },
      bodyStyles: { fontSize: 8.5, cellPadding: 2.5, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 16 }, 2: { cellWidth: 40 } },
      margin: { left: M, right: M },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  const pairs = (rows: [string, string | null | undefined][]) => {
    autoTable(doc, {
      startY: y,
      body: rows.map(([k, v]) => [k, v || '—']),
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: HEADER_FILL, cellWidth: 48 } },
      margin: { left: M, right: M },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  y = checkPage(doc, y, 45)
  y = sectionLabel(doc, 'Freight return', y)
  pairs([
    ['Requested by', ret.requested_by], ['Freight company', ret.freight_company], ['Docket number', ret.freight_docket || (ret.freight_company ? 'Docket pending' : null)],
    ['Pickup location', ret.pickup_location], ['Expected pickup', fmtDateLong(ret.expected_pickup_date)], ['Estimated arrival at factory', fmtDateLong(ret.estimated_arrival_date)],
  ])

  y = checkPage(doc, y, 45)
  y = sectionLabel(doc, 'Factory receiving', y)
  pairs([
    ['Received by', ret.received_by], ['Date received', fmtDateLong(ret.date_received)], ['Location in factory', ret.factory_location],
    ['Damage on arrival', ret.arrival_damage], ['Person responsible', ret.responsible_person],
  ])

  if (ret.completed_at) {
    y = checkPage(doc, y, 20)
    y = sectionLabel(doc, 'Completed', y)
    y = bodyText(doc, `Completed ${fmtDateTime(ret.completed_at)}${ret.completed_by ? ` by ${ret.completed_by}` : ''}. New SO / job number: ${ret.new_so_number || '—'}.`, y)
  }

  const sitePhotos = ret.photos.filter(p => p.kind === 'site')
  if (sitePhotos.length) {
    y = checkPage(doc, y, 20)
    y = sectionLabel(doc, 'Site photos', y)
    for (const p of sitePhotos) {
      y = checkPage(doc, y, 100)
      const data = await fetchPhotoAsDataUrl(p.blob_pathname)
      if (data) y = photoImage(doc, data, y)
    }
  }
  const factoryPhotos = ret.photos.filter(p => p.kind === 'factory')
  if (factoryPhotos.length) {
    y = checkPage(doc, y, 20)
    y = sectionLabel(doc, 'Factory photos', y)
    for (const p of factoryPhotos) {
      y = checkPage(doc, y, 100)
      const data = await fetchPhotoAsDataUrl(p.blob_pathname)
      if (data) y = photoImage(doc, data, y)
    }
  }

  if (ret.activity?.length) {
    y = checkPage(doc, y, 25)
    y = sectionLabel(doc, 'Activity', y)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    for (const a of ret.activity) {
      y = checkPage(doc, y, 6)
      const changed = Object.keys(a.changes || {}).filter(k => k !== 'status_manual').join(', ')
      doc.text(`${fmtDateTime(a.created_at)} · ${a.actor || 'Someone'} · ${a.action}${changed ? ` (${changed})` : ''}`, M, y)
      y += 4.2
    }
    doc.setTextColor(0)
  }

  const pages = (doc as any).getNumberOfPages?.() ?? 1
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    if (i > 1) {
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED)
      doc.text(`Factory Return ${ret.return_number} — ${ret.original_job_name}`, M, 12)
      doc.text(`Page ${i}`, PW - M, 12, { align: 'right' })
      doc.setDrawColor(...LINE).setLineWidth(0.2)
      doc.line(M, 15, PW - M, 15)
      doc.setDrawColor(0).setTextColor(0)
    }
    if (ret.overdue) {
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...RED)
      doc.text('OVERDUE', PW - M, 20, { align: 'right' })
      doc.setTextColor(0)
    }
  }
  void CW
  return doc
}

export async function generateReturnPDF(ret: ReturnRecord) {
  const doc = await buildReturnPDF(ret)
  doc.save(`${ret.return_number}-${ret.original_job_number}.pdf`)
}
