import type { EodConfig, EodReport } from '../types'

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

// Opens the user's own mail client with a pre-filled draft for them to review, add the
// client's address, and send — same client-side mailto: pattern as FloatingMeetingNotes.tsx.
// There's no confirmation a mailto draft was actually sent, hence the separate explicit
// "mark as emailed" action in the Library once the user has actually sent it.
export function openReportEmailDraft(report: EodReport, config: Pick<EodConfig, 'defectsNoticeText' | 'emailSignoff' | 'internalCcAddress'>) {
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
