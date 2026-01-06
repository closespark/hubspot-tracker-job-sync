// Tracker Webhook Event Types
export enum TrackerEventType {
  JOB_CREATED = 'Job.Created',
  JOB_UPDATED = 'Job.Updated',
  PLACEMENT_CREATED = 'Placement.Created',
  PLACEMENT_UPDATED = 'Placement.Updated',
}

// Webhook Payload
export interface WebhookPayload {
  eventType: TrackerEventType;
  eventId: string;
  timestamp: string;
  data: {
    jobId?: string;
    placementId?: string;
    [key: string]: any;
  };
}

// Tracker API Models
export interface TrackerJob {
  id: string;
  name: string;
  status: string;
  createdDate: string;
  updatedDate: string;
  companyName?: string;
  [key: string]: any;
}

export interface TrackerPlacement {
  id: string;
  jobId: string;
  candidateName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
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

// Idempotency
export interface ProcessedEvent {
  eventId: string;
  processedAt: Date;
  status: 'success' | 'failed';
  error?: string;
}
