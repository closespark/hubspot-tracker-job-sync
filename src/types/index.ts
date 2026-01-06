// Tracker API Models
export interface TrackerJob {
  id: string;
  name: string;
  status: string;
  createdDate: string;
  updatedDate: string;
  companyName?: string;
  jobType?: string;
  engagementDirector?: string;
  jobValue?: number;
  jobOwner?: string;
  [key: string]: any;
}

export interface TrackerPlacement {
  id: string;
  jobId: string;
  candidateName?: string;
  status: string;
  startDate?: string;
  createdDate: string;
  updatedDate: string;
  [key: string]: any;
}

// HubSpot Models
export interface HubSpotJobProperties {
  tracker_job_id: string;
  job_name: string;
  job_status: string;
  job_created_date_tracker: string;
  job_type?: string;
  engagement_director?: string;
  job_value?: string;
  job_owner?: string;
  [key: string]: any;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    service_line?: string;
    createdate?: string;
    [key: string]: any;
  };
  associations?: {
    companies?: { id: string }[];
  };
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name: string;
    [key: string]: any;
  };
}

// Job-Deal Matching Result
export interface MatchResult {
  matched: boolean;
  dealId?: string;
  confidence: 'exact' | 'high' | 'low' | 'ambiguous' | 'none';
  reason?: string;
  candidateDeals?: Array<{
    id: string;
    dealname: string;
    score: number;
  }>;
}

// Sync Result
export interface SyncResult {
  jobsProcessed: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsMatched: number;
  errors: string[];
}
