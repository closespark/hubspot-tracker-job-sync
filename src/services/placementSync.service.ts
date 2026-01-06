import { trackerClient } from '../clients/tracker.js';
import { hubspotClient } from '../clients/hubspot.js';
import { logger } from '../utils/logger.js';
import {
  TrackerPlacement,
  TrackerCandidate,
  HubSpotPlacementProperties,
  HubSpotContactProperties,
  PlacementSyncResult,
  PlacementStatus,
  PlacementOutcomeType,
} from '../types/index.js';

// Allowed placement statuses that trigger sync
const ALLOWED_PLACEMENT_STATUSES: PlacementStatus[] = [
  'Placed Perm',
  'On Assignment',
  'Converted To Perm',
  'Withdrawn',
  'Declined',
  'Ended',
  'Cancelled',
  'Backed Out',
  'Ended Early',
];

// Statuses that allow candidate contact creation (HARD RULE)
const CANDIDATE_ELIGIBLE_STATUSES: PlacementStatus[] = [
  'Placed Perm',
  'On Assignment',
  'Converted To Perm',
];

// Statuses that MUST BLOCK candidate sync (HARD RULE)
const CANDIDATE_BLOCKED_STATUSES: PlacementStatus[] = [
  'Withdrawn',
  'Declined',
  'Cancelled',
  'Backed Out',
  'Ended',
  'Ended Early',
];

export class PlacementSyncService {
  /**
   * Sync all placements from Tracker to HubSpot
   */
  async syncAllPlacements(): Promise<PlacementSyncResult> {
    const result: PlacementSyncResult = {
      placementsProcessed: 0,
      placementsCreated: 0,
      placementsUpdated: 0,
      placementsSkipped: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      errors: [],
    };

    try {
      logger.info('Starting placement sync from TrackerRMS');

      // Poll all placements from Tracker
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const placements = await trackerClient.listPlacements(limit, offset);

        if (placements.length === 0) {
          hasMore = false;
          break;
        }

        logger.info(`Processing ${placements.length} placements (offset: ${offset})`);

        for (const placement of placements) {
          try {
            result.placementsProcessed++;
            await this.syncPlacement(placement, result);
          } catch (error) {
            const errorMsg = `Error syncing placement ${placement.id}: ${error}`;
            logger.error(errorMsg, error);
            result.errors.push(errorMsg);
          }
        }

        offset += placements.length;

        // If we got fewer results than the limit, we've reached the end
        if (placements.length < limit) {
          hasMore = false;
        }
      }

      logger.info('Placement sync completed', {
        placementsProcessed: result.placementsProcessed,
        placementsCreated: result.placementsCreated,
        placementsUpdated: result.placementsUpdated,
        placementsSkipped: result.placementsSkipped,
        candidatesCreated: result.candidatesCreated,
        candidatesUpdated: result.candidatesUpdated,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error('Fatal error during placement sync', error);
      result.errors.push(`Fatal error: ${error}`);
    }

    return result;
  }

  /**
   * Sync a single placement
   */
  private async syncPlacement(
    placement: TrackerPlacement,
    result: PlacementSyncResult
  ): Promise<void> {
    // Validate placement status
    if (!ALLOWED_PLACEMENT_STATUSES.includes(placement.status as PlacementStatus)) {
      logger.warn(`Skipping placement ${placement.id}: Invalid status "${placement.status}"`);
      result.placementsSkipped++;
      return;
    }

    // Fetch related Job and Candidate data from Tracker
    const [job, candidate] = await Promise.all([
      placement.job || trackerClient.getJob(placement.jobId),
      placement.candidate || trackerClient.getCandidate(placement.candidateId),
    ]);

    // Check if the Job exists in HubSpot (placements NEVER exist without jobs)
    const hubspotJobId = await hubspotClient.getJobIdByTrackerJobId(placement.jobId);

    if (!hubspotJobId) {
      logger.warn(
        `Skipping placement ${placement.id}: Job ${placement.jobId} not found in HubSpot`
      );
      result.placementsSkipped++;
      return;
    }

    // Build placement properties
    const placementProperties = this.buildPlacementProperties(placement, job.name, candidate.fullName);

    // Upsert placement in HubSpot
    const existingPlacementId = await hubspotClient.getJobIdByTrackerJobId(placement.id); // Will search for placement
    const placementId = await hubspotClient.upsertPlacement(placementProperties);

    if (existingPlacementId) {
      result.placementsUpdated++;
    } else {
      result.placementsCreated++;
    }

    // Create associations for placement
    await this.createPlacementAssociations(placementId, hubspotJobId, placement.jobId);

    // CANDIDATE CONTACT CREATION - STRICT ELIGIBILITY CHECK
    const isCandidateEligible = this.isCandidateEligible(placement.status as PlacementStatus);

    if (isCandidateEligible) {
      // Only create/update candidate contact if status is eligible
      await this.syncCandidateContact(placement, candidate, placementId, result);
    } else {
      logger.debug(
        `Skipping candidate contact creation for placement ${placement.id}: Status "${placement.status}" not eligible`
      );
    }

    logger.info(`Successfully synced placement ${placement.id} to HubSpot`);
  }

  /**
   * Check if candidate contact creation is eligible for this placement status
   * HARD RULE: Only "Placed Perm", "On Assignment", "Converted To Perm"
   */
  private isCandidateEligible(status: PlacementStatus): boolean {
    // Explicit positive check
    if (CANDIDATE_ELIGIBLE_STATUSES.includes(status)) {
      return true;
    }

    // Explicit negative guard (MUST BLOCK)
    if (CANDIDATE_BLOCKED_STATUSES.includes(status)) {
      logger.warn(`Candidate sync explicitly blocked for status: ${status}`);
      return false;
    }

    // Default: not eligible
    return false;
  }

  /**
   * Build placement properties for HubSpot
   */
  private buildPlacementProperties(
    placement: TrackerPlacement,
    jobName: string,
    candidateFullName: string
  ): HubSpotPlacementProperties {
    const outcomeType = this.computeOutcomeType(placement.status as PlacementStatus);

    return {
      placement_id_tracker: placement.id,
      placement_name: `${candidateFullName} – ${jobName}`,
      job_id_tracker: placement.jobId,
      job_name: jobName,
      candidate_id_tracker: placement.candidateId,
      candidate_name: candidateFullName,
      placement_status: placement.status,
      placement_outcome_type: outcomeType,
      date_assigned: placement.dateAssigned || undefined,
      date_confirmed: placement.dateConfirmed || undefined,
      placement_start_date: placement.placementStartDate || undefined,
      end_date: placement.endDate || undefined,
      scheduled_end_date: placement.scheduledEndDate || undefined,
      date_closed: placement.dateClosed || undefined,
      conversion_start_date: placement.conversionStartDate || undefined,
      agreement_signed_date: placement.agreementSignedDate || undefined,
      days_guaranteed: placement.daysGuaranteed?.toString() || undefined,
      assignment_value: placement.assignmentValue?.toString() || undefined,
      placement_fee_percent: placement.placementFeePercent?.toString() || undefined,
      actual_margin: placement.actualMargin?.toString() || undefined,
      actual_margin_percent: placement.actualMarginPercent?.toString() || undefined,
      bill_rate: placement.billRate?.toString() || undefined,
      pay_rate: placement.payRate?.toString() || undefined,
      placement_currency: placement.placementCurrency || undefined,
      recruiter: placement.recruiter || undefined,
      coordinator: placement.coordinator || undefined,
      engagement_director: placement.engagementDirector || undefined,
    };
  }

  /**
   * Compute placement outcome type from status
   */
  private computeOutcomeType(status: PlacementStatus): PlacementOutcomeType {
    switch (status) {
      case 'Placed Perm':
      case 'On Assignment':
        return 'Placed';
      case 'Converted To Perm':
        return 'Converted';
      case 'Ended':
      case 'Ended Early':
        return 'Ended';
      case 'Withdrawn':
      case 'Declined':
      case 'Cancelled':
      case 'Backed Out':
        return 'Cancelled';
      default:
        return 'Cancelled'; // Default fallback
    }
  }

  /**
   * Create all required associations for a placement
   */
  private async createPlacementAssociations(
    placementId: string,
    hubspotJobId: string,
    trackerJobId: string
  ): Promise<void> {
    try {
      // Associate Placement → Job
      await hubspotClient.associatePlacementToJob(placementId, hubspotJobId);

      // Get the Deal and Company associated with the Job
      // We need to fetch the Job's associations to find its Deal
      // For now, we'll skip this and let the associations be created manually
      // TODO: Implement Job → Deal lookup to get dealId and companyId
      logger.debug(`Placement ${placementId} associated to Job ${hubspotJobId}`);
    } catch (error) {
      logger.error(`Error creating placement associations for ${placementId}`, error);
      // Don't throw - associations are best-effort
    }
  }

  /**
   * Sync candidate contact (ONLY when eligible)
   */
  private async syncCandidateContact(
    placement: TrackerPlacement,
    candidate: TrackerCandidate,
    placementId: string,
    result: PlacementSyncResult
  ): Promise<void> {
    // Double-check eligibility (defensive programming)
    if (!this.isCandidateEligible(placement.status as PlacementStatus)) {
      logger.error(
        `CRITICAL: Attempted to sync candidate for ineligible status "${placement.status}"`
      );
      return;
    }

    // Build contact properties
    const contactProperties: HubSpotContactProperties = {
      candidate_id_tracker: candidate.id,
      firstname: candidate.firstName || undefined,
      lastname: candidate.lastName || undefined,
      email: candidate.email || undefined,
      phone: candidate.phone || undefined,
      lifecyclestage: 'Placed Candidate', // LOCKED VALUE
    };

    // Upsert contact in HubSpot
    try {
      // Check if contact already exists
      const existingContactId = await this.findContactByTrackerCandidateId(candidate.id);

      const contactId = await hubspotClient.upsertContact(contactProperties);

      if (existingContactId) {
        result.candidatesUpdated++;
        logger.info(`Updated candidate contact ${candidate.id} in HubSpot`);
      } else {
        result.candidatesCreated++;
        logger.info(`Created candidate contact ${candidate.id} in HubSpot`);
      }

      // Associate Contact → Placement
      await hubspotClient.associatePlacementToContact(placementId, contactId);
    } catch (error) {
      logger.error(`Error syncing candidate contact ${candidate.id}`, error);
      throw error;
    }
  }

  /**
   * Find contact by candidate_id_tracker
   */
  private async findContactByTrackerCandidateId(candidateId: string): Promise<string | null> {
    try {
      // This is a simplified lookup - in production, use HubSpot search API
      // For now, we'll return null and let upsertContact handle it
      return null;
    } catch (error) {
      logger.error(`Error finding contact by candidate_id_tracker: ${candidateId}`, error);
      return null;
    }
  }
}

export const placementSyncService = new PlacementSyncService();
