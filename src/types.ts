export interface JobCard {
  id: string
  job_number: string
  project_name: string
  address: string | null
  created_at: string
  created_by: string | null
}

export interface Installer {
  id: string
  name: string
  email: string | null
  phone: string | null
  pin: string
  role: 'installer' | 'team_leader'
  admin_access: boolean
  created_at: string
}

export interface ReportPhoto {
  id: string
  blob_pathname: string
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
  email_sent: boolean
  email_sent_at: string | null
  created_at: string
  job: Pick<JobCard, 'id' | 'job_number' | 'project_name' | 'address'> | null
  installer: Pick<Installer, 'id' | 'name'> | null
  photos: ReportPhoto[]
}

export interface VisibleFields {
  products: boolean
  issues_solutions: boolean
  photos: boolean
}

export interface EodConfig {
  internalCcAddress: string
  emailSignoff: string
  defectsNoticeText: string
  defaultInstallerId: string | null
  visibleFields: VisibleFields
}

export interface SigninLogEntry {
  id: number
  installer_id: string | null
  installer_name: string
  signed_in_at: string
}
