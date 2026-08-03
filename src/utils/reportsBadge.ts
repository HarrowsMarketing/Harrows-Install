// Lightweight "new reports since I last checked" badge — no backend/push infra,
// just a per-device localStorage timestamp compared against report.created_at.
const KEY_PREFIX = 'eod_reports_last_seen_'

export function getLastSeen(scope: string): string {
  return localStorage.getItem(KEY_PREFIX + scope) || '1970-01-01T00:00:00.000Z'
}

export function markReportsSeen(scope: string) {
  localStorage.setItem(KEY_PREFIX + scope, new Date().toISOString())
}

export function countNewReports(reports: { created_at: string }[], lastSeen: string): number {
  return reports.filter(r => r.created_at > lastSeen).length
}
