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

export interface TrackerCandidate {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

export interface TrackerPlacement {
  id: string;
  jobId: string;
  job?: TrackerJob;
  candidateId: string;
  candidate?: TrackerCandidate;
  status: string; // Must be one of the 9 allowed values
  dateAssigned?: string;
  dateConfirmed?: string;
  placementStartDate?: string;
  endDate?: string;
  scheduledEndDate?: string;
  dateClosed?: string;
  conversionStartDate?: string;
  agreementSignedDate?: string;
  daysGuaranteed?: number;
  assignmentValue?: number;
  placementFeePercent?: number;
  actualMargin?: number;
  actualMarginPercent?: number;
  billRate?: number;
  payRate?: number;
  placementCurrency?: string;
  recruiter?: string;
  coordinator?: string;
  engagementDirector?: string;
  createdDate: string;
  updatedDate: string;
  [key: string]: any;
}

// HubSpot Models
export interface HubSpotJobProperties {
  job_id_tracker: string;
  job_name: string;
  job_status: string;
  job_created_date_tracker: string;
  job_type?: string;
  engagement_director?: string;
  estimated_fee__job_value?: string;
  job_owner_tracker?: string;
  [key: string]: any;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    service?: string;
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

// HubSpot Placement Properties
export interface HubSpotPlacementProperties {
  placement_id_tracker: string;
  placement_name: string;
  job_id_tracker: string;
  job_name: string;
  candidate_id_tracker: string;
  candidate_name: string;
  placement_status: string;
  placement_outcome_type: string;
  date_assigned?: string;
  date_confirmed?: string;
  placement_start_date?: string;
  end_date?: string;
  scheduled_end_date?: string;
  date_closed?: string;
  conversion_start_date?: string;
  agreement_signed_date?: string;
  days_guaranteed?: string;
  assignment_value?: string;
  placement_fee?: string;
  actual_margin?: string;
  actual_margin_percent?: string;
  bill_rate?: string;
  pay_rate?: string;
  placement_currency?: string;
  recruiter?: string;
  coordinator?: string;
  engagement_director?: string;
  [key: string]: any;
}

// HubSpot Contact Properties (for placed candidates)
export interface HubSpotContactProperties {
  candidate_id_tracker: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  lifecyclestage: string; // Always "Placed Candidate"
  [key: string]: any;
}

// Sync Result
export interface SyncResult {
  jobsProcessed: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsMatched: number;
  errors: string[];
}

// Placement Sync Result
export interface PlacementSyncResult {
  placementsProcessed: number;
  placementsCreated: number;
  placementsUpdated: number;
  placementsSkipped: number; // Not eligible (status not in allowed list)
  candidatesCreated: number;
  candidatesUpdated: number;
  errors: string[];
}

// Placement Status
export type PlacementStatus =
  | 'Placed Perm'
  | 'On Assignment'
  | 'Converted To Perm'
  | 'Withdrawn'
  | 'Declined'
  | 'Ended'
  | 'Cancelled'
  | 'Backed Out'
  | 'Ended Early';

// Placement Outcome Type (computed from status)
export type PlacementOutcomeType = 'Placed' | 'Converted' | 'Ended' | 'Cancelled';
