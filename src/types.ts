export interface JobCard {
  id: string
  job_number: string
  project_name: string
  address: string | null
  billing_company: string | null
  invoice_to: string | null
  invoice_phone: string | null
  invoice_email: string | null
  pm_name: string | null
  pm_phone: string | null
  pm_email: string | null
  salesperson_name: string | null
  salesperson_email: string | null
  created_at: string
  created_by: string | null
}

export interface JobCardScanFields {
  jobNumber: string
  projectName: string
  address: string
  billingCompany: string
  invoiceTo: string
  invoicePhone: string
  invoiceEmail: string
  pmName: string
  pmPhone: string
  pmEmail: string
  salespersonName: string
  salespersonEmail: string
}

export interface Installer {
  id: string
  name: string
  email: string | null
  phone: string | null
  pin: string
  role: 'installer' | 'team_leader'
  admin_access: boolean
  photo_pathname: string | null
  created_at: string
}

export interface ReportPhoto {
  id: string
  blob_pathname: string
  is_internal: boolean
}

export interface EodReport {
  id: string
  job_id: string | null
  installer_id: string | null
  report_date: string
  percent_complete: number
  work_done: string
  work_scheduled_tomorrow: string | null
  products: string | null
  issues: string | null
  solutions: string | null
  additional_notes: string | null
  internal_notes: string | null
  email_sent: boolean
  email_sent_at: string | null
  created_at: string
  job: Pick<JobCard, 'id' | 'job_number' | 'project_name' | 'address'> | null
  installer: Pick<Installer, 'id' | 'name' | 'photo_pathname'> | null
  photos: ReportPhoto[]
}

export interface VisibleFields {
  products: boolean
  issues_solutions: boolean
  photos: boolean
}

export interface NotificationRecipient {
  name: string
  email: string
}

export interface EodConfig {
  defectsNoticeText: string
  defaultInstallerId: string | null
  visibleFields: VisibleFields
  notificationRecipients: NotificationRecipient[]
}

export interface SigninLogEntry {
  id: number
  installer_id: string | null
  installer_name: string
  signed_in_at: string
}

// ── Returns ────────────────────────────────────────────────────────────────────

export type ReturnPriority = 'urgent' | 'high' | 'normal'
export type ReturnStatus = 'logged' | 'freight_booked' | 'in_transit' | 'received' | 'completed'
export type ReturnPhotoKind = 'site' | 'factory'

export interface ReturnItem {
  description: string
  quantity: number
  action: string | null
}

export interface ReturnPhoto {
  id: string
  blob_pathname: string
  kind: ReturnPhotoKind
  url: string | null // presigned by the API; null means fall back to /api/install/photos/url
  created_at: string
}

export interface ReturnActivity {
  id: number
  actor: string | null
  action: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  created_at: string
}

export interface ReturnRecord {
  id: string
  return_number: string
  job_id: string | null
  original_job_number: string
  original_job_name: string
  site_address: string | null
  new_so_number: string | null
  required_by: string | null
  priority: ReturnPriority
  reason: string
  issue_description: string | null
  photos_attached: boolean | null
  items: ReturnItem[]
  requested_by: string | null
  freight_company: string | null
  freight_docket: string | null
  pickup_location: string | null
  expected_pickup_date: string | null
  estimated_arrival_date: string | null
  received_by: string | null
  date_received: string | null
  factory_location: string | null
  arrival_damage: string | null
  responsible_person: string | null
  status: ReturnStatus       // effective (manual override if set, otherwise automatic)
  status_auto: ReturnStatus  // what the automatic rule says right now
  status_manual: boolean
  overdue: boolean
  completed_at: string | null
  completed_by: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  job: Pick<JobCard, 'id' | 'job_number' | 'project_name' | 'address'> | null
  photos: ReturnPhoto[]
  activity?: ReturnActivity[]
}

export interface ReturnOptions {
  staff: string[]
  freightCompanies: string[]
  factoryLocations: string[]
  reasons: string[]
  actions: string[]
}

export interface ReturnMatch {
  confidence: number
  reason: string
  return: ReturnRecord
}
