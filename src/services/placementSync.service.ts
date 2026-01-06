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

// Allowed placement statuses that trigger sync (all 9 valid statuses)
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

// HARD RULE: Statuses that allow candidate contact creation
// ONLY these three - no exceptions
const CANDIDATE_ELIGIBLE_STATUSES = new Set<PlacementStatus>([
  'Placed Perm',
  'On Assignment',
  'Converted To Perm',
]);

/**
 * Check if candidate contact creation is eligible for this placement status
 * HARD RULE: Only "Placed Perm", "On Assignment", "Converted To Perm"
 */
const shouldSyncPlacedCandidateContact = (placementStatus?: string | null): boolean => {
  return !!placementStatus && CANDIDATE_ELIGIBLE_STATUSES.has(placementStatus as PlacementStatus);
};

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

    // DEFENSIVE GUARD: Placement must have a valid job ID
    if (!placement.jobId) {
      logger.error(`Invalid placement ${placement.id}: Missing job ID`);
      result.placementsSkipped++;
      return;
    }

    // Check if the Job exists in HubSpot (placements ALWAYS belong to jobs)
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
    const placementId = await hubspotClient.upsertPlacement(placementProperties);

    // Create associations for placement
    await this.createPlacementAssociations(placementId, hubspotJobId, placement.jobId);

    // CANDIDATE CONTACT CREATION - STRICT ELIGIBILITY CHECK
    const isCandidateEligible = shouldSyncPlacedCandidateContact(placement.status);

    if (isCandidateEligible) {
      // Only create/update candidate contact if status is eligible
      await this.syncCandidateContact(placement, candidate, placementId, result);
    } else {
      logger.debug(
        `Skipping candidate contact creation for placement ${placement.id}: Status "${placement.status}" not eligible (must be: Placed Perm, On Assignment, or Converted To Perm)`
      );
    }

    logger.info(`Successfully synced placement ${placement.id} to HubSpot`);
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
   * HARD RULE: Can only be called for "Placed Perm", "On Assignment", "Converted To Perm"
   */
  private async syncCandidateContact(
    placement: TrackerPlacement,
    candidate: TrackerCandidate,
    placementId: string,
    result: PlacementSyncResult
  ): Promise<void> {
    // Double-check eligibility (defensive programming)
    if (!shouldSyncPlacedCandidateContact(placement.status)) {
      logger.error(
        `CRITICAL: Attempted to sync candidate for ineligible status "${placement.status}"`
      );
      return;
    }

    // Build contact properties with LOCKED lifecycle stage
    const contactProperties: HubSpotContactProperties = {
      candidate_id_tracker: candidate.id,
      firstname: candidate.firstName || undefined,
      lastname: candidate.lastName || undefined,
      email: candidate.email || undefined,
      phone: candidate.phone || undefined,
      lifecyclestage: 'Placed Candidate', // LOCKED VALUE - not "Contact Type"
    };

    // Upsert contact in HubSpot (will search and update or create)
    try {
      const contactId = await hubspotClient.upsertContact(contactProperties);
      
      // Note: We can't easily track created vs updated without checking first,
      // but the upsertContact method logs the action
      result.candidatesCreated++; // This is approximate - may be updates

      logger.info(`Synced placed candidate contact ${candidate.id} in HubSpot`);

      // Associate Contact → Placement
      await hubspotClient.associatePlacementToContact(placementId, contactId);
    } catch (error) {
      logger.error(`Error syncing candidate contact ${candidate.id}`, error);
      throw error;
    }
  }
}

export const placementSyncService = new PlacementSyncService();
