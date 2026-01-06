import { config } from '../config/index.js';
import { HubSpotDeal, TrackerJob, MatchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Normalizes a deal/job name for matching
 * - Converts to lowercase
 * - Trims whitespace
 * - Normalizes spaces
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Canonical Job ↔ Deal Matching Algorithm (EXACT MATCH ONLY)
 * 
 * Rules:
 * - Normalize both sides (lowercase, trim whitespace)
 * - Exactly ONE match required
 * - Zero matches → skip
 * - Multiple matches → log ambiguity, skip
 * - No fallback keys, no IDs, no Company name matching
 * 
 * Algorithm:
 * 1. Normalize job.name
 * 2. Query HubSpot Deals where dealname matches job.name (exact) and service == "Retained Search"
 * 3. If exactly 1 Deal → MATCH
 * 4. If 0 or >1 → SKIP, log only
 */
export async function matchJobToDeal(
  job: TrackerJob,
  deals: HubSpotDeal[]
): Promise<MatchResult> {
  logger.debug(`Matching job ${job.id} (${job.name}) to deals`);
  
  const normalizedJobName = normalizeName(job.name);
  
  // Filter deals by exact name match (normalized) and service line
  const matches = deals.filter(deal => {
    const dealName = deal.properties.dealname;
    const serviceLine = deal.properties.service;
    
    // Must be exact name match (normalized)
    const normalizedDealName = normalizeName(dealName);
    if (normalizedDealName !== normalizedJobName) {
      return false;
    }
    
    // Must be Retained Search (if service line is specified)
    if (serviceLine && serviceLine !== config.hubspot.dealServiceLineRetainedValue) {
      return false;
    }
    
    return true;
  });
  
  logger.debug(`Found ${matches.length} deals with exact name match "${normalizedJobName}"`);
  
  // EXACTLY ONE match required
  if (matches.length === 0) {
    logger.debug(`No deals found for job ${job.id} (${job.name})`);
    return {
      matched: false,
      confidence: 'none',
      reason: 'Zero matches - skipping'
    };
  }
  
  if (matches.length === 1) {
    logger.info(`Exact match found for job ${job.id} -> deal ${matches[0].id}`);
    return {
      matched: true,
      dealId: matches[0].id,
      confidence: 'exact',
      reason: 'Exactly one deal matched by name and service line'
    };
  }
  
  // Multiple matches - log and skip
  logger.warn(`Job matching skipped for ${job.id}: ${matches.length} matches for "${job.name}"`);
  
  return {
    matched: false,
    confidence: 'ambiguous',
    reason: `Multiple matches (${matches.length}) - skipping, manual review required`,
    candidateDeals: matches.map(deal => ({
      id: deal.id,
      dealname: deal.properties.dealname,
      score: 0
    }))
  };
}
