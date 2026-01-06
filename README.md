# HubSpot Tracker Job Sync

Webhook-driven integration that syncs TrackerRMS Jobs and Placements into HubSpot as read-only custom objects. Listens to Tracker-originated events, upserts Jobs and Placements in HubSpot, and associates them to Deals, Companies, and Tickets for reporting and visibility.

## Features

- 🔄 **Real-time Sync**: Receives webhooks from TrackerRMS and syncs data to HubSpot
- 🎯 **Idempotency**: Prevents duplicate processing of the same webhook event
- 🔁 **Retry Logic**: Automatic retry with exponential backoff for failed API calls
- 🔒 **Security**: Optional webhook signature validation
- 📊 **Associations**: Automatically associates Jobs and Placements with Deals, Companies, and Tickets
- 🚀 **Production Ready**: Configured for easy deployment to Render
- 📝 **TypeScript**: Fully typed for better developer experience

## Webhook Events Supported

The service handles the following TrackerRMS webhook events:

- `Opportunity.Created` - Syncs new job opportunities to HubSpot
- `Opportunity.Updated` - Updates existing jobs in HubSpot
- `OpportunityResource.Created` - Creates new placement records
- `OpportunityResource.Updated` - Updates existing placements

## Architecture

```
TrackerRMS → Webhook → This Service → HubSpot API
                ↓
         Idempotency Check
                ↓
         Fetch Full Record from Tracker API
                ↓
         Upsert to HubSpot Custom Objects
                ↓
         Create Associations (Deals, Companies, Tickets)
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- HubSpot Private App with the following scopes:
  - `crm.objects.custom.read`
  - `crm.objects.custom.write`
  - `crm.objects.deals.read`
  - `crm.objects.companies.read`
  - `crm.schemas.custom.read`
- TrackerRMS API credentials
- HubSpot Custom Objects created:
  - `tracker_jobs` with properties: `tracker_job_id`, `job_title`, `job_description`, `job_status`, `created_at`, `updated_at`
  - `tracker_placements` with properties: `tracker_placement_id`, `placement_status`, `candidate_name`, `start_date`, `end_date`, `rate`, `created_at`, `updated_at`

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

Edit `.env` with your values:

```env
PORT=3000
NODE_ENV=production

# HubSpot Configuration
HUBSPOT_ACCESS_TOKEN=your_hubspot_private_app_token_here

# TrackerRMS Configuration
TRACKER_API_URL=https://api.trackersoftware.com/v1
TRACKER_API_KEY=your_tracker_api_key_here

# Webhook Security (optional)
WEBHOOK_SECRET=your_webhook_secret_for_verification

# Retry Configuration
MAX_RETRIES=3
RETRY_DELAY_MS=1000

# Logging
LOG_LEVEL=info
```

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

### POST /webhook

Receives webhook events from TrackerRMS.

**Request Headers:**
- `Content-Type: application/json`
- `X-Webhook-Signature` (optional): Webhook signature for validation

**Request Body:**
```json
{
  "eventType": "Opportunity.Created",
  "eventId": "evt_12345",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "opportunityId": "opp_67890"
  }
}
```

**Response (Success):**
```json
{
  "status": "success",
  "eventId": "evt_12345"
}
```

**Response (Already Processed):**
```json
{
  "status": "already_processed",
  "processedAt": "2024-01-01T12:00:00Z"
}
```

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

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
   - `WEBHOOK_SECRET` (optional)

### Manual Deployment

On any Node.js hosting platform:

1. Set environment variables
2. Run `npm install && npm run build`
3. Run `npm start`
4. Configure your TrackerRMS webhook to point to `https://your-domain.com/webhook`

## HubSpot Custom Object Setup

Before using this service, you need to create custom objects in HubSpot:

### tracker_jobs Custom Object

Properties:
- `tracker_job_id` (Single-line text, unique identifier)
- `job_title` (Single-line text)
- `job_description` (Multi-line text)
- `job_status` (Single-line text)
- `created_at` (Date picker)
- `updated_at` (Date picker)

### tracker_placements Custom Object

Properties:
- `tracker_placement_id` (Single-line text, unique identifier)
- `placement_status` (Single-line text)
- `candidate_name` (Single-line text)
- `start_date` (Date picker)
- `end_date` (Date picker)
- `rate` (Number)
- `created_at` (Date picker)
- `updated_at` (Date picker)

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

## Idempotency

The service implements idempotency to prevent duplicate processing of webhook events. Each event is tracked by its `eventId`, and subsequent requests with the same `eventId` will return a success response without reprocessing.

**Note**: In production, consider replacing the in-memory idempotency store with a persistent solution like Redis or a database.

## Retry Logic

The service implements retry logic with exponential backoff for all API calls to both TrackerRMS and HubSpot. If an API call fails:

1. First retry after `RETRY_DELAY_MS` milliseconds
2. Second retry after `RETRY_DELAY_MS * 2` milliseconds
3. Third retry after `RETRY_DELAY_MS * 4` milliseconds

After exhausting all retries, the error is logged and the webhook returns a 500 error.

## Error Handling

- All errors are logged with timestamps and context
- Failed webhook processing returns a 500 status with error details
- Failed associations (e.g., to non-existent deals) are logged but don't fail the entire sync
- Graceful shutdown on SIGTERM/SIGINT signals

## Logging

Log levels (configurable via `LOG_LEVEL`):
- `debug`: Detailed debugging information
- `info`: General informational messages (default)
- `warn`: Warning messages
- `error`: Error messages

## Security Considerations

- Use `WEBHOOK_SECRET` to validate incoming webhooks
- Store API credentials in environment variables, never in code
- Use HTTPS in production
- Consider implementing rate limiting for production deployments
- Replace in-memory idempotency store with persistent storage in production

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
