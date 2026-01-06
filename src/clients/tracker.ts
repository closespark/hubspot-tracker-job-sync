import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { TrackerJob, TrackerPlacement } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export class TrackerClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.tracker.apiUrl,
      headers: {
        'Authorization': `Bearer ${config.tracker.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getJob(jobId: string): Promise<TrackerJob> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Fetching job ${jobId} from Tracker`);
        const response = await this.client.get<TrackerJob>(`/jobs/${jobId}`);
        logger.debug(`Successfully fetched job ${jobId}`);
        return response.data;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.getJob(${jobId})`
    );
  }

  async getPlacement(placementId: string): Promise<TrackerPlacement> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Fetching placement ${placementId} from Tracker`);
        const response = await this.client.get<TrackerPlacement>(`/placements/${placementId}`);
        logger.debug(`Successfully fetched placement ${placementId}`);
        return response.data;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.getPlacement(${placementId})`
    );
  }
}

export const trackerClient = new TrackerClient();
