// Tracker Webhook Event Types
export enum TrackerEventType {
  OPPORTUNITY_CREATED = 'Opportunity.Created',
  OPPORTUNITY_UPDATED = 'Opportunity.Updated',
  OPPORTUNITY_RESOURCE_CREATED = 'OpportunityResource.Created',
  OPPORTUNITY_RESOURCE_UPDATED = 'OpportunityResource.Updated',
}

// Webhook Payload
export interface WebhookPayload {
  eventType: TrackerEventType;
  eventId: string;
  timestamp: string;
  data: {
    opportunityId?: string;
    opportunityResourceId?: string;
    [key: string]: any;
  };
}

// Tracker API Models
export interface TrackerOpportunity {
  id: string;
  title: string;
  description?: string;
  status: string;
  companyId?: string;
  dealId?: string;
  ticketId?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface TrackerOpportunityResource {
  id: string;
  opportunityId: string;
  resourceId: string;
  candidateName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  rate?: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

// HubSpot Models
export interface HubSpotJobProperties {
  tracker_job_id: string;
  job_title: string;
  job_description?: string;
  job_status: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface HubSpotPlacementProperties {
  tracker_placement_id: string;
  placement_status: string;
  candidate_name?: string;
  start_date?: string;
  end_date?: string;
  rate?: number;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

// Idempotency
export interface ProcessedEvent {
  eventId: string;
  processedAt: Date;
  status: 'success' | 'failed';
  error?: string;
}
