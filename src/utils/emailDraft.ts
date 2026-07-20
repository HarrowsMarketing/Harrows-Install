import type { EodConfig, EodReport } from '../types'
import { getReportPDFFile } from './generateReportPDF'

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildReportEmailBody(report: EodReport, config: Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff'>) {
  const lines: string[] = []
  lines.push(`End of Day Report — ${report.job?.project_name || 'Job'}${report.job?.job_number ? ` (Job ${report.job.job_number})` : ''}`)
  lines.push(fmtDate(report.report_date))
  lines.push('')
  lines.push(`Work completed today (${report.percent_complete}%):`)
  lines.push(report.work_done)
  if (report.work_scheduled_tomorrow) {
    lines.push('', 'Scheduled for tomorrow:', report.work_scheduled_tomorrow)
  }
  if (report.products) {
    lines.push('', 'Products:', report.products)
  }
  if (report.issues || report.solutions) {
    lines.push('', 'Issues & Solutions:')
    if (report.issues) lines.push(`Issues: ${report.issues}`)
    if (report.solutions) lines.push(`Solutions: ${report.solutions}`)
  }
  if (report.additional_notes) {
    lines.push('', 'Additional notes:', report.additional_notes)
  }
  if (config.defectsNoticeText) {
    lines.push('', config.defectsNoticeText)
  }
  lines.push('', config.emailSignoff || 'Harrows Install Team')
  return lines.join('\n')
}

function openMailtoDraft(report: EodReport, config: Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff' | 'internalCcAddress'>) {
  const subject = `End of Day Report — ${report.job?.project_name || 'Job'} (${report.report_date})`
  const body = buildReportEmailBody(report, config)
  let href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  if (config.internalCcAddress) href += `&cc=${encodeURIComponent(config.internalCcAddress)}`
  const link = document.createElement('a')
  link.href = href
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// mailto: links can't carry attachments — that's a browser/OS limitation, not something
// fixable client-side. So on devices with the Web Share API (effectively every phone),
// hand the PDF to the native share sheet instead, where the user picks Mail/Gmail/etc.
// and the PDF actually arrives as a real attachment. On desktop browsers without file
// sharing support, fall back to downloading the PDF and opening a mailto draft, same as
// before — the user just has to attach the downloaded file themselves.
// There's no confirmation a share/mailto draft was actually sent, hence the separate
// explicit "mark as emailed" action in the Library once the user has actually sent it.
export async function shareOrDraftReportEmail(report: EodReport, config: Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff' | 'internalCcAddress'>) {
  const subject = `End of Day Report — ${report.job?.project_name || 'Job'} (${report.report_date})`
  const body = buildReportEmailBody(report, config)
  const pdfFile = await getReportPDFFile(report)

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> }
  if (nav.canShare?.({ files: [pdfFile] }) && nav.share) {
    try {
      await nav.share({ files: [pdfFile], title: subject, text: body })
      return
    } catch (e: any) {
      if (e?.name === 'AbortError') return // user cancelled the share sheet — not a failure
      // fall through to the mailto fallback below on any other share failure
    }
  }

  downloadFile(pdfFile)
  openMailtoDraft(report, config)
}
