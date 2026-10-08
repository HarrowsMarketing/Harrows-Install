import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { ReturnRecord } from '../types'
import { priorityLabel, returnLink } from '../lib/returns'
import { LOGO_ASPECT, LOGO_SRC, fetchAsDataUrl } from './generateReportPDF'

// A6 (105 × 148 mm) tag: big return number, QR code that opens the return at Factory
// Receiving, job, priority, "RETURN TO HARROWS FACTORY – TIMARU". Optional — nothing
// depends on it; it's for taping on the item or emailing to the freight company.
export async function buildReturnTag(ret: ReturnRecord): Promise<jsPDF> {
  const W = 105, H = 148, M = 8
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' })

  const logo = await fetchAsDataUrl(LOGO_SRC)
  const logoW = 36
  if (logo) { try { doc.addImage(logo, 'JPEG', (W - logoW) / 2, M, logoW, logoW * LOGO_ASPECT) } catch { /* skip */ } }

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(17, 24, 39)
  doc.text('RETURN TO HARROWS FACTORY – TIMARU', W / 2, M + 14, { align: 'center' })
  doc.setDrawColor(17, 24, 39).setLineWidth(0.6)
  doc.line(M, M + 17, W - M, M + 17)

  doc.setFont('helvetica', 'bold').setFontSize(34)
  doc.text(ret.return_number, W / 2, M + 32, { align: 'center' })

  const qr = await QRCode.toDataURL(returnLink(ret.id, true), { margin: 0, width: 600, errorCorrectionLevel: 'M' })
  const qrSize = 48
  doc.addImage(qr, 'PNG', (W - qrSize) / 2, M + 38, qrSize, qrSize)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(107, 114, 128)
  doc.text('Scan to receive this item', W / 2, M + 38 + qrSize + 4, { align: 'center' })

  let y = M + 38 + qrSize + 12
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(17, 24, 39)
  doc.text(`JOB ${ret.original_job_number}`, W / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal').setFontSize(10)
  const nameLines = doc.splitTextToSize(ret.original_job_name, W - M * 2)
  doc.text(nameLines, W / 2, y, { align: 'center' })
  y += nameLines.length * 4.5 + 4

  const pr = ret.priority === 'urgent' ? [220, 38, 38] : ret.priority === 'high' ? [249, 115, 22] : [107, 114, 128]
  doc.setFillColor(pr[0], pr[1], pr[2])
  const pillW = 40, pillH = 9
  doc.roundedRect((W - pillW) / 2, y - 1, pillW, pillH, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255)
  doc.text(priorityLabel(ret.priority).toUpperCase(), W / 2, y + 5.3, { align: 'center' })

  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(107, 114, 128)
  doc.text(`${ret.reason}${ret.items[0]?.description ? ` · ${ret.items[0].description}` : ''}`.slice(0, 70), W / 2, H - M, { align: 'center' })
  doc.setTextColor(0)
  return doc
}

function tagFilename(ret: ReturnRecord) {
  return `${ret.return_number}-tag.pdf`
}

// Opens the tag in a new tab so it can be printed from the browser (or AirPrinted / shared
// from the phone's PDF viewer).
export async function printReturnTag(ret: ReturnRecord) {
  const doc = await buildReturnTag(ret)
  const url = URL.createObjectURL(doc.output('blob'))
  const win = window.open(url, '_blank')
  if (!win) doc.save(tagFilename(ret))
}

// Phones: native share sheet with the PDF attached (so it can go straight to the freight
// company by email/WhatsApp). Desktop fallback: download + a text-only mailto draft, since
// mailto: links can never carry attachments.
export async function shareReturnTag(ret: ReturnRecord) {
  const doc = await buildReturnTag(ret)
  const file = new File([doc.output('blob')], tagFilename(ret), { type: 'application/pdf' })
  const subject = `Return tag ${ret.return_number} — Job ${ret.original_job_number} ${ret.original_job_name}`
  const text = `Return ${ret.return_number} for pickup${ret.pickup_location ? ` from ${ret.pickup_location}` : ''}. Please deliver to Harrows factory, Timaru.${ret.freight_docket ? ` Docket ${ret.freight_docket}.` : ''}`
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: subject, text }); return } catch (e: any) { if (e?.name === 'AbortError') return }
  }
  doc.save(tagFilename(ret))
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(The return tag PDF has been downloaded — please attach it.)')}`
}
