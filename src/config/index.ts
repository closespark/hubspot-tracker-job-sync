export interface Config {
  port: number;
  nodeEnv: string;
  hubspot: {
    accessToken: string;
    jobObjectType: string;
    jobIdProperty: string;
    jobNameProperty: string;
    jobStatusProperty: string;
    jobCreatedDateProperty: string;
    jobTypeProperty: string;
    engagementDirectorProperty: string;
    jobValueProperty: string;
    jobOwnerProperty: string;
    dealNameProperty: string;
    dealServiceLineProperty: string;
    dealServiceLineRetainedValue: string;
    companyNameProperty: string;
    dealCreatedDateProperty: string;
  };
  tracker: {
    apiUrl: string;
    apiKey: string;
  };
  polling: {
    intervalHours: number;
    enabled: boolean;
  };
  retry: {
    maxRetries: number;
    delayMs: number;
  };
  matching: {
    createdDateWindowDays: number;
  };
  logLevel: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  hubspot: {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN || '',
    jobObjectType: process.env.HUBSPOT_JOB_OBJECT_TYPE || 'tracker_jobs',
    jobIdProperty: process.env.HUBSPOT_JOB_ID_PROPERTY || 'tracker_job_id',
    jobNameProperty: process.env.HUBSPOT_JOB_NAME_PROPERTY || 'job_name',
    jobStatusProperty: process.env.HUBSPOT_JOB_STATUS_PROPERTY || 'job_status',
    jobCreatedDateProperty: process.env.HUBSPOT_JOB_CREATED_DATE_PROPERTY || 'job_created_date_tracker',
    jobTypeProperty: process.env.HUBSPOT_JOB_TYPE_PROPERTY || 'job_type',
    engagementDirectorProperty: process.env.HUBSPOT_ENGAGEMENT_DIRECTOR_PROPERTY || 'engagement_director',
    jobValueProperty: process.env.HUBSPOT_JOB_VALUE_PROPERTY || 'job_value',
    jobOwnerProperty: process.env.HUBSPOT_JOB_OWNER_PROPERTY || 'job_owner',
    dealNameProperty: process.env.HUBSPOT_DEAL_NAME_PROPERTY || 'dealname',
    dealServiceLineProperty: process.env.HUBSPOT_DEAL_SERVICE_LINE_PROPERTY || 'service_line',
    dealServiceLineRetainedValue: process.env.HUBSPOT_DEAL_SERVICE_LINE_RETAINED_VALUE || 'Retained Search',
    companyNameProperty: process.env.HUBSPOT_COMPANY_NAME_PROPERTY || 'name',
    dealCreatedDateProperty: process.env.HUBSPOT_DEAL_CREATED_DATE_PROPERTY || 'createdate',
  },
  tracker: {
    apiUrl: process.env.TRACKER_API_URL || 'https://api.trackersoftware.com/v1',
    apiKey: process.env.TRACKER_API_KEY || '',
  },
  polling: {
    intervalHours: parseInt(process.env.POLLING_INTERVAL_HOURS || '24', 10),
    enabled: process.env.POLLING_ENABLED !== 'false',
  },
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
  },
  matching: {
    createdDateWindowDays: parseInt(process.env.MATCHING_CREATED_DATE_WINDOW_DAYS || '14', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
