import { config } from '../config/index.js';
import { HubSpotDeal, TrackerJob, MatchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Normalizes a deal/job name for matching
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes extra spaces
 * - Removes punctuation
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim();
}

/**
 * Checks if two names are a close match
 * - Exact match after normalization
 * - One contains the other (for prefixed names)
 */
export function isCloseMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  
  if (!na || !nb) return false;
  if (na === nb) return true;
  
  // Tolerant contains matching (useful if Deal Name has prefix like "ACME - CFO (Retained)")
  if (na.includes(nb) || nb.includes(na)) return true;
  
  return false;
}

/**
 * Checks if a date is within the specified window
 */
function isWithinDateWindow(date1: string, date2: string, windowDays: number): boolean {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d1.getTime() - d2.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= windowDays;
  } catch (error) {
    logger.warn('Error comparing dates', { date1, date2, error });
    return false;
  }
}

/**
 * Canonical Job ↔ Deal Matching Algorithm
 * 
 * Algorithm:
 * 1. Normalize job.name
 * 2. Query HubSpot Deals where dealname matches job.name and service_line == "Retained Search"
 * 3. If exactly 1 Deal → MATCH
 * 4. If >1:
 *    - Filter by associated company name
 *    - Filter by created date window (±14 days)
 * 5. If still ambiguous → flag for manual review
 * 6. Return match result
 */
export async function matchJobToDeal(
  job: TrackerJob,
  deals: HubSpotDeal[],
  companiesMap: Map<string, string> // dealId -> company name
): Promise<MatchResult> {
  logger.debug(`Matching job ${job.id} (${job.name}) to deals`);
  
  // Step 1: Filter deals by name match and service line
  const nameMatches = deals.filter(deal => {
    const dealName = deal.properties.dealname;
    const serviceLine = deal.properties.service_line;
    
    // Must match name
    if (!isCloseMatch(job.name, dealName)) {
      return false;
    }
    
    // Must be Retained Search (if service line is specified)
    if (serviceLine && serviceLine !== config.hubspot.dealServiceLineRetainedValue) {
      return false;
    }
    
    return true;
  });
  
  logger.debug(`Found ${nameMatches.length} deals matching name and service line`);
  
  // Step 2: If exactly 1 match, we're done
  if (nameMatches.length === 0) {
    return {
      matched: false,
      confidence: 'none',
      reason: 'No deals found with matching name and service line'
    };
  }
  
  if (nameMatches.length === 1) {
    logger.info(`Exact match found for job ${job.id} -> deal ${nameMatches[0].id}`);
    return {
      matched: true,
      dealId: nameMatches[0].id,
      confidence: 'exact',
      reason: 'Single deal matched by name and service line'
    };
  }
  
  // Step 3: Multiple matches - apply disambiguation
  logger.debug(`Multiple matches (${nameMatches.length}), applying disambiguation`);
  
  let candidates = [...nameMatches];
  
  // Disambiguate by company name if job has company info
  if (job.companyName) {
    const normalizedJobCompany = normalizeName(job.companyName);
    
    const companyMatches = candidates.filter(deal => {
      const dealCompanyName = companiesMap.get(deal.id);
      if (!dealCompanyName) return false;
      
      return isCloseMatch(normalizedJobCompany, dealCompanyName);
    });
    
    if (companyMatches.length === 1) {
      logger.info(`Company disambiguation resolved to single deal ${companyMatches[0].id}`);
      return {
        matched: true,
        dealId: companyMatches[0].id,
        confidence: 'high',
        reason: 'Matched by name, service line, and company'
      };
    }
    
    if (companyMatches.length > 0) {
      candidates = companyMatches;
      logger.debug(`Company filter reduced candidates to ${candidates.length}`);
    }
  }
  
  // Disambiguate by created date proximity
  if (job.createdDate) {
    const dateMatches = candidates.filter(deal => {
      const dealCreatedDate = deal.properties[config.hubspot.dealCreatedDateProperty];
      if (!dealCreatedDate) return false;
      
      return isWithinDateWindow(
        job.createdDate,
        dealCreatedDate,
        config.matching.createdDateWindowDays
      );
    });
    
    if (dateMatches.length === 1) {
      logger.info(`Date disambiguation resolved to single deal ${dateMatches[0].id}`);
      return {
        matched: true,
        dealId: dateMatches[0].id,
        confidence: 'high',
        reason: `Matched by name, service line, and created date within ${config.matching.createdDateWindowDays} days`
      };
    }
    
    if (dateMatches.length > 0) {
      candidates = dateMatches;
      logger.debug(`Date filter reduced candidates to ${candidates.length}`);
    }
  }
  
  // Still ambiguous
  logger.warn(`Ambiguous match for job ${job.id}: ${candidates.length} candidates remain`);
  
  return {
    matched: false,
    confidence: 'ambiguous',
    reason: `Multiple deals (${candidates.length}) matched - manual review required`,
    candidateDeals: candidates.map(deal => ({
      id: deal.id,
      dealname: deal.properties.dealname,
      score: 0 // Could implement scoring logic here
    }))
  };
}
