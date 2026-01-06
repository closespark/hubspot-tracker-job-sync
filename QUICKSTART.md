# Quick Start Guide

Get the HubSpot Tracker Job Sync service running in 5 minutes.

## Step 1: Clone and Install (1 minute)

```bash
git clone https://github.com/closespark/hubspot-tracker-job-sync.git
cd hubspot-tracker-job-sync
npm install
```

## Step 2: Configure Environment (2 minutes)

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Minimum required configuration
HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TRACKER_API_URL=https://your-tracker-instance.com/api/v1
TRACKER_API_KEY=your_tracker_api_key_here
```

**Where to find these:**
- **HubSpot Token**: Settings → Integrations → Private Apps → Create/Select App → Get Access Token
- **Tracker API**: Contact your TrackerRMS administrator for API URL and credentials

## Step 3: Build and Start (1 minute)

```bash
npm run build
npm start
```

You should see:
```
[INFO] Server is running on port 3000
[INFO] Health check available at http://localhost:3000/health
[INFO] Webhook endpoint available at http://localhost:3000/webhook
```

## Step 4: Test the Service (1 minute)

### Test health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2024-01-01T12:00:00.000Z"}
```

### Test webhook endpoint (optional):

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Opportunity.Created",
    "eventId": "test-123",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "opportunityId": "test-opp-123"
    }
  }'
```

This will attempt to fetch data from TrackerRMS (and fail if test credentials are used, which is expected).

## Step 5: Configure TrackerRMS Webhook

In your TrackerRMS admin panel:

1. Go to Webhooks/Integrations
2. Create new webhook
3. URL: `http://localhost:3000/webhook` (or your deployed URL)
4. Select events:
   - Opportunity.Created
   - Opportunity.Updated
   - OpportunityResource.Created
   - OpportunityResource.Updated
5. Save

## Next Steps

- Review [README.md](README.md) for detailed documentation
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- See [examples/webhook-payloads.md](examples/webhook-payloads.md) for testing examples

## Troubleshooting

### Port 3000 already in use

Change the port in `.env`:
```env
PORT=3001
```

### API connection errors

1. Verify API credentials are correct
2. Check network connectivity
3. Review logs for specific error messages

### HubSpot custom objects not found

Make sure you've created the custom objects in HubSpot:
- `tracker_jobs`
- `tracker_placements`

See [DEPLOYMENT.md](DEPLOYMENT.md#hubspot-custom-object-setup) for setup instructions.

## Development Mode

For development with auto-reload:

```bash
npm run dev
```

This uses `ts-node` to run TypeScript directly without building.
