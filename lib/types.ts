export type Company = {
  id: string;
  name: string;
  sheet_id: string | null;
  sheet_url: string | null;
  created_at: string | null;
  // Added by migrations/002_companies_sheet_tab.sql — absent until that migration runs.
  sheet_tab: string | null;
  // Added by migrations/006_company_sync_status.sql — absent until that migration runs.
  sync_status: "ok" | "error" | null;
  sync_error: string | null;
  // Added by migrations/007_company_sheet_link.sql — absent until that migration runs.
  company_sheet_url: string | null;
  company_sheet_id: string | null;
};

export type Candidate = {
  id: string;
  company_id: string;
  name: string | null;
  phone: string | null;
  job_role: string | null;
  call_done_by: string | null;
  call_date: string | null;
  tr_status: string | null;
  tr_tech_rating: string | null;
  tr_comm_rating: string | null;
  tech_screening_taken_by: string | null;
  tech_status: string | null;
  tech_tech_rating: string | null;
  tech_comm_rating: string | null;
  tech_remarks: string | null;
  recording_link: string | null;
  shared_to_company: boolean | null;
  company_decision: string | null;
  skills: string | null;
  tech_screening_date: string | null;
  tech_screening_time: string | null;
  source_row_hash: string | null;
  last_synced_at: string | null;
  // Added by migrations/001_recruiter_pipeline.sql — absent until that migration runs.
  recruiter: string | null;
  interested: boolean | null;
  // Added by migrations/008_sourced_date.sql — absent until that migration runs.
  sourced_date: string | null;
  // Added by migrations/009_call_status.sql — absent until that migration runs.
  call_status: string | null;
};

export type CandidateWithCompany = Candidate & {
  companies: { name: string } | null;
};

// Added by migrations/004_sync_runs.sql — one row per sync job execution.
export type SyncRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  companies_synced: number;
  total_inserted: number;
  total_updated: number;
  total_errors: number;
  error_details: string | null;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Partial<Company>;
        Update: Partial<Company>;
      };
      candidates: {
        Row: Candidate;
        Insert: Partial<Candidate>;
        Update: Partial<Candidate>;
      };
      sync_runs: {
        Row: SyncRun;
        Insert: Partial<SyncRun>;
        Update: Partial<SyncRun>;
      };
    };
  };
};
