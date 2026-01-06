import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { TrackerJob, TrackerPlacement, TrackerCandidate } from '../types/index.js';
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

  /**
   * List all jobs (for polling)
   * This is the primary method for polling-based sync
   */
  async listJobs(limit: number = 100, offset: number = 0): Promise<TrackerJob[]> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Listing jobs from Tracker (limit: ${limit}, offset: ${offset})`);
        const response = await this.client.get<{ data: TrackerJob[]; total: number }>('/jobs', {
          params: { limit, offset },
        });
        logger.debug(`Successfully listed ${response.data.data?.length || 0} jobs`);
        return response.data.data || [];
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.listJobs(limit=${limit}, offset=${offset})`
    );
  }

  /**
   * Get a single job by ID
   */
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

  /**
   * List all placements (for polling)
   */
  async listPlacements(limit: number = 100, offset: number = 0): Promise<TrackerPlacement[]> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Listing placements from Tracker (limit: ${limit}, offset: ${offset})`);
        const response = await this.client.get<{ data: TrackerPlacement[]; total: number }>('/placements', {
          params: { limit, offset },
        });
        logger.debug(`Successfully listed ${response.data.data?.length || 0} placements`);
        return response.data.data || [];
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.listPlacements(limit=${limit}, offset=${offset})`
    );
  }

  /**
   * Get a single placement by ID
   */
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

  /**
   * Get a single candidate by ID
   */
  async getCandidate(candidateId: string): Promise<TrackerCandidate> {
    return retryWithBackoff(
      async () => {
        logger.debug(`Fetching candidate ${candidateId} from Tracker`);
        const response = await this.client.get<TrackerCandidate>(`/candidates/${candidateId}`);
        logger.debug(`Successfully fetched candidate ${candidateId}`);
        return response.data;
      },
      config.retry.maxRetries,
      config.retry.delayMs,
      `Tracker.getCandidate(${candidateId})`
    );
  }
}

export const trackerClient = new TrackerClient();
