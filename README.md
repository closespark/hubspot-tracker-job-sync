# HubSpot TrackerRMS Job Sync

Polling-based integration that syncs TrackerRMS Jobs, Placements, and Placed Candidates into HubSpot as read-only custom objects. Polls TrackerRMS on a scheduled cadence, matches Jobs to Deals using deterministic Deal Name matching, and creates Contact records only for successfully placed candidates.

> **Note**: TrackerRMS does not provide webhooks for Job/Placement creation or updates. This integration uses scheduled polling as the only viable integration pattern.

## Features

- 🔄 **Scheduled Polling**: Polls TrackerRMS every 24 hours (configurable)
- 🎯 **Exact Deal Matching**: Deterministic Job-to-Deal matching using normalized Deal Name only
- 🔁 **Retry Logic**: Automatic retry with exponential backoff for failed API calls
- 🔒 **Strict Guardrails**: Hard-coded compliance rules prevent early candidate syncing
- 📊 **Associations**: Automatically associates Jobs/Placements to Deals, Companies, and Contacts
- 🚀 **Production Ready**: Configured for easy deployment to Render with Docker support
- 📝 **TypeScript**: Fully typed with ES modules for better developer experience

## System of Record Boundaries

**TrackerRMS (Authoritative)**
- Jobs
- Placements
- Candidates
- Delivery status

**HubSpot (Commercial + Reporting Only)**
- Deals (commercial)
- Companies
- Lifecycle reporting
- NO delivery ownership

> **Critical**: HubSpot never creates Jobs, Placements, or Candidates. TrackerRMS always originates them.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Polling Scheduler (24-hour interval)                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Poll HubSpot Deals                                      │
│     Filter: service="Retained Search"                        │
│             job_sync_status="Awaiting Job Creation"         │
│             dealstage="closedwon"                           │
│             associated company EXISTS                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Poll TrackerRMS Jobs (read-only, paginated)            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Match Jobs → Deals                                      │
│     normalize(deal.name) === normalize(job.name)            │
│     • Exactly ONE match required                            │
│     • Zero matches → skip + log                             │
│     • Multiple matches → skip + log (ambiguous)             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Upsert HubSpot Job Custom Objects                       │
│     External ID: job_id_tracker                             │
│     Associations: Job → Deal, Job → Company                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Poll TrackerRMS Placements (read-only)                  │
│     Filter: placement.jobId must exist                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  6. Upsert HubSpot Placement Custom Objects                 │
│     External ID: placement_id_tracker                       │
│     Associations: Placement → Job → Deal → Company          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  7. Create Candidate Contacts (ONLY for placed candidates)  │
│     HARD GUARDRAIL: Status ∈ {"Placed Perm",               │
│                               "On Assignment",              │
│                               "Converted To Perm"}          │
│     Set lifecyclestage="placed_candidate"                   │
│     Associations: Contact → Placement → Job → Company       │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- HubSpot Private App with the following scopes:
  - `crm.objects.custom.read`
  - `crm.objects.custom.write`
  - `crm.objects.deals.read`
  - `crm.objects.companies.read`
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
  - `crm.schemas.custom.read`
- TrackerRMS API credentials (read-only access)
- HubSpot Custom Objects pre-created:
  - **Job** custom object (`jobs`)
  - **Placement** custom object (`placements`)
- HubSpot Deal Properties (must exist):
  - `service` (dropdown with "Retained Search" option)
  - `job_sync_status` (text with "Awaiting Job Creation" value)
  - `dealstage` (pipeline stage with "closedwon" internal value)
- HubSpot Contact Lifecycle Stage:
  - "Placed Candidate" custom lifecycle stage (internal value: `placed_candidate`)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/closespark/hubspot-tracker-job-sync.git
cd hubspot-tracker-job-sync
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values. **Key configuration**:

```env
PORT=3000
NODE_ENV=production

# HubSpot Configuration
HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token_here

# HubSpot Job Custom Object
HUBSPOT_JOB_OBJECT_TYPE=jobs
HUBSPOT_JOB_ID_PROPERTY=job_id_tracker
HUBSPOT_JOB_NAME_PROPERTY=job_name
HUBSPOT_JOB_STATUS_PROPERTY=job_status

# HubSpot Deal Properties (for eligibility filtering)
HUBSPOT_DEAL_SERVICE_LINE_PROPERTY=service
HUBSPOT_DEAL_SERVICE_LINE_RETAINED_VALUE=Retained Search
HUBSPOT_DEAL_STAGE_PROPERTY=dealstage
HUBSPOT_DEAL_STAGE_CLOSED_WON_VALUE=closedwon
HUBSPOT_DEAL_JOB_SYNC_STATUS_PROPERTY=job_sync_status
HUBSPOT_DEAL_JOB_SYNC_STATUS_AWAITING_VALUE=Awaiting Job Creation

# TrackerRMS Configuration (Read-Only)
TRACKER_API_URL=https://api.trackersoftware.com/v1
TRACKER_API_KEY=your_tracker_api_key_here

# Polling Configuration
POLLING_ENABLED=true
POLLING_INTERVAL_HOURS=24

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Logging
LOG_LEVEL=info
```

> **Important**: Do not configure webhook secrets. TrackerRMS does not provide webhooks.

### 4. Build the application

```bash
npm run build
```

### 5. Start the server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "mode": "polling",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### POST /sync/manual

Admin endpoint to trigger an immediate sync cycle (bypasses scheduler).

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "message": "Manual sync triggered"
}
```

> **Note**: This service does NOT expose webhook endpoints. TrackerRMS has no webhooks.

## Deployment

### Deploy to Render

This service is configured for easy deployment to Render using the included `render.yaml` configuration.

1. Push your code to a GitHub repository
2. Connect your repository to Render
3. Render will automatically detect the `render.yaml` and configure the service
4. Set the required environment variables in Render dashboard:
   - `HUBSPOT_ACCESS_TOKEN`
   - `TRACKER_API_URL`
   - `TRACKER_API_KEY`
   - (Optional) Override default polling interval, property names, etc.

### Docker Deployment

Build and run with Docker:

```bash
docker build -t hubspot-tracker-sync .
docker run -d \
  -e HUBSPOT_ACCESS_TOKEN=your_token \
  -e TRACKER_API_URL=https://api.trackersoftware.com/v1 \
  -e TRACKER_API_KEY=your_key \
  -e POLLING_ENABLED=true \
  -e POLLING_INTERVAL_HOURS=24 \
  -p 3000:3000 \
  hubspot-tracker-sync
```

### Manual Deployment

On any Node.js hosting platform:

1. Set environment variables
2. Run `npm install && npm run build`
3. Run `npm start`
4. Service will begin polling on the configured interval (default: 24 hours)

> **Note**: Do NOT configure TrackerRMS webhooks. This service polls TrackerRMS APIs directly.

## HubSpot Custom Object Setup

Before using this service, you need to create custom objects in HubSpot:

### Job Custom Object (`jobs`)

**Required Properties:**
- `job_id_tracker` (Single-line text, **unique identifier**)
- `job_name` (Single-line text) - Maps to Tracker job.name
- `job_status` (Single-line text) - Maps to Tracker job.status
- `job_created_date_tracker` (Date picker) - Read-only from Tracker
- `job_type` (Single-line text, optional)
- `engagement_director` (Single-line text, optional)
- `estimated_fee__job_value` (Number, optional)
- `job_owner_tracker` (Single-line text, optional)

**Associations:**
- Can be associated to: Deals, Companies

### Placement Custom Object (`placements`)

**Required Properties:**
- `placement_id_tracker` (Single-line text, **unique identifier**)
- `placement_name` (Single-line text) - Generated: `"{Candidate} – {Job}"`
- `placement_status` (Single-line text) - Exact match from Tracker
  - Allowed: "Placed Perm", "On Assignment", "Converted To Perm", "Withdrawn", "Declined", "Ended", "Cancelled", "Backed Out", "Ended Early"
- `placement_outcome_type` (Single-line text) - Computed:
  - "Placed", "Converted", "Ended", or "Cancelled"
- `job_id_tracker` (Single-line text) - Reference to Job
- `candidate_id_tracker` (Single-line text)
- `candidate_name` (Single-line text)

**Optional Financial/Date Properties:**
- `assignment_value`, `placement_fee`, `actual_margin`, `bill_rate`, `pay_rate`
- `date_assigned`, `placement_start_date`, `end_date`, `conversion_start_date`
- `recruiter`, `coordinator`, `engagement_director` (text fields, NOT user references)

**Associations:**
- Can be associated to: Jobs, Deals, Companies, Contacts

### Deal Properties (Must Already Exist)

These are standard or custom Deal properties your HubSpot portal must have:

- `service` - Dropdown with "Retained Search" option
- `job_sync_status` - Text field with "Awaiting Job Creation" value
- `dealstage` - Pipeline stage (internal value: `closedwon`)

### Contact Lifecycle Stage

Create a custom lifecycle stage:
- **Label**: "Placed Candidate"
- **Internal Value**: `placed_candidate`

> **Critical**: Use the internal value, not the label, in API calls.

## Job ↔ Deal Matching Logic

The service uses **exact, deterministic matching** with no fallbacks:

### Matching Algorithm

```typescript
normalize(hubspotDeal.dealname) === normalize(trackerJob.name)
```

### Normalization Rules

1. Convert to lowercase
2. Trim leading/trailing whitespace
3. Normalize internal whitespace to single spaces

### Match Requirements

- **Exactly ONE match required**
  - Zero matches → Skip job, log warning
  - Multiple matches → Skip job, log ambiguity
- **No secondary matching keys**
  - ❌ No company name matching
  - ❌ No created date proximity
  - ❌ No fuzzy matching
  - ❌ No ID-based fallbacks

### Example

Deal Names are typically a combination of company name and job title (e.g., "Acme - Road Runner Medic").

```typescript
// These MATCH:
HubSpot Deal Name: "Acme Corp - Chief Financial Officer"
Tracker Job Name:  "acme corp - chief financial officer"

// These DO NOT MATCH:
HubSpot Deal Name: "Acme Corp - CFO"
Tracker Job Name:  "Acme Corp - Chief Financial Officer"
```

> **Why exact matching?** Prevents false positives and maintains data integrity. If a Job doesn't match, manual review is required.

## Candidate Contact Creation (HARD GUARDRAILS)

**Critical compliance rule**: Candidates are synced to HubSpot **ONLY after successful placement**.

### Eligibility Rule (Non-Negotiable)

A Contact is created/updated **IF AND ONLY IF**:

```typescript
placement.status ∈ {
  "Placed Perm",
  "On Assignment",
  "Converted To Perm"
}
```

### Explicit Blocks

The integration will **NEVER** sync candidates with these statuses:

- ❌ Withdrawn
- ❌ Declined
- ❌ Cancelled
- ❌ Backed Out
- ❌ Ended
- ❌ Ended Early

### What Happens When Eligible

When placement status allows syncing:

1. **Create/Update Contact** using:
   - Email (if present), OR
   - `candidate_id_tracker` as external ID
2. **Set Lifecycle Stage** to `placed_candidate` (internal value)
3. **Create Associations**:
   - Contact → Placement
   - Contact → Job
   - Contact → Company

### What Does NOT Happen

- ❌ No Contact Type modifications
- ❌ No workflow triggers
- ❌ No marketing enrollment
- ❌ No data enrichment
- ❌ No pre-placement syncing (interviews, shortlists, finalists)

> **Why this matters**: Violating these rules is a SOW compliance failure. TrackerRMS is the sole System of Record for candidates.

## Development

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Polling Architecture

### Polling Cycle

The service runs on a scheduled interval (default: 24 hours):

1. **Startup**: First sync runs immediately when the service starts
2. **Scheduled**: Subsequent syncs run every `POLLING_INTERVAL_HOURS`
3. **Manual Trigger**: Admin can trigger via `POST /sync/manual`

### Cadence Rationale

- **24-hour interval is correct** for this use case
- Faster polling adds no business value (delivery timelines are human-scale)
- TrackerRMS has no webhooks; polling is the only viable integration pattern

### Batch Processing

- Jobs and Placements are fetched with pagination
- Large volumes are processed incrementally
- Failed items are logged but don't block the entire sync

## Retry Logic

The service implements retry logic with exponential backoff for all API calls to both TrackerRMS and HubSpot. If an API call fails:

1. First retry after `RETRY_DELAY_MS` milliseconds
2. Second retry after `RETRY_DELAY_MS * 2` milliseconds
3. Third retry after `RETRY_DELAY_MS * 4` milliseconds

After exhausting all retries, the error is logged and the sync continues with the next item.

## Error Handling

- All errors are logged with timestamps and context
- Failed job/placement processing is logged but doesn't halt the sync
- Failed associations (e.g., to non-existent deals) are logged with warnings
- Graceful shutdown on SIGTERM/SIGINT signals
- Individual failures don't prevent the polling cycle from completing

## Security Considerations

- Store API credentials in environment variables, never in code
- Use HTTPS in production
- HubSpot Private App tokens have scoped permissions
- TrackerRMS API access is read-only
- Consider implementing rate limiting for the manual sync endpoint
- No webhook signature validation needed (no webhooks exist)

## Production Considerations

### Multi-Instance Deployments

- Current implementation is stateless and supports horizontal scaling
- No shared state between instances
- Each instance runs its own polling cycle (consider coordination if needed)

### Monitoring

- Monitor `/health` endpoint for uptime
- Track sync completion times and failure rates
- Set up alerts for repeated job matching failures
- Monitor API rate limits (both HubSpot and TrackerRMS)

### Data Integrity

- **Upsert pattern**: Jobs and Placements are never deleted, only created/updated
- **External IDs**: `job_id_tracker` and `placement_id_tracker` ensure idempotent upserts
- **Read-only**: TrackerRMS remains the sole System of Record
- **No backfilling**: Integration does not create historical data in Tracker

### Deal Eligibility Changes

If a Deal changes status (e.g., `job_sync_status` changes), the Job association persists:
- Existing Job → Deal associations are not removed
- New Jobs will not match Deals that no longer meet criteria
- This is intentional: past associations remain for reporting

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
