export interface Config {
  port: number;
  nodeEnv: string;
  hubspot: {
    accessToken: string;
  };
  tracker: {
    apiUrl: string;
    apiKey: string;
  };
  webhook: {
    secret?: string;
  };
  retry: {
    maxRetries: number;
    delayMs: number;
  };
  logLevel: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  hubspot: {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN || '',
  },
  tracker: {
    apiUrl: process.env.TRACKER_API_URL || 'https://api.trackersoftware.com/v1',
    apiKey: process.env.TRACKER_API_KEY || '',
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET,
  },
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
