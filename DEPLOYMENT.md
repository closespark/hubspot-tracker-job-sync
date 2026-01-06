# Deployment Guide

This guide covers deploying the HubSpot Tracker Job Sync service to production.

## Prerequisites

Before deploying, ensure you have:

1. **HubSpot Private App** with the following scopes:
   - `crm.objects.custom.read`
   - `crm.objects.custom.write`
   - `crm.objects.deals.read`
   - `crm.objects.companies.read`
   - `crm.schemas.custom.read`

2. **HubSpot Custom Objects** created:
   - `jobs` (fully qualified name: `p{portal_id}_jobs`)
   - `placements` (fully qualified name: `p{portal_id}_placements`)

3. **TrackerRMS API credentials**

## HubSpot Custom Object Setup

### Creating Custom Objects

1. Log in to your HubSpot account
2. Go to Settings → Data Management → Objects
3. Click "Create custom object"

### jobs Custom Object

**Object Name:** Jobs  
**Object Label (singular):** Job  
**Object Label (plural):** Jobs

**Properties:**
- `tracker_job_id` (Single-line text, unique identifier)
- `job_title` (Single-line text)
- `job_description` (Multi-line text)
- `job_status` (Single-line text)
- `created_at` (Date picker)
- `updated_at` (Date picker)

### placements Custom Object

**Object Name:** Placements  
**Object Label (singular):** Placement  
**Object Label (plural):** Placements

**Properties:**
- `tracker_placement_id` (Single-line text, unique identifier)
- `placement_status` (Single-line text)
- `candidate_name` (Single-line text)
- `start_date` (Date picker)
- `end_date` (Date picker)
- `rate` (Number)
- `created_at` (Date picker)
- `updated_at` (Date picker)

## Deploy to Render

### Step 1: Connect Repository

1. Sign up or log in to [Render](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `hubspot-tracker-job-sync` repository

### Step 2: Configure Service

Render will automatically detect the `render.yaml` configuration file. Verify the settings:

- **Name:** hubspot-tracker-job-sync
- **Environment:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Plan:** Starter (or higher)

### Step 3: Set Environment Variables

In the Render dashboard, add the following environment variables:

**Required:**
- `HUBSPOT_ACCESS_TOKEN` - Your HubSpot Private App access token
- `TRACKER_API_URL` - TrackerRMS API URL (e.g., `https://api.trackersoftware.com/v1`)
- `TRACKER_API_KEY` - Your TrackerRMS API key

**Optional:**
- `WEBHOOK_SECRET` - Secret for validating webhook signatures
- `MAX_RETRIES` - Number of retry attempts (default: 3)
- `RETRY_DELAY_MS` - Initial retry delay in milliseconds (default: 1000)
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)

**Automatically Set:**
- `NODE_ENV` - Set to `production`
- `PORT` - Set to `10000`

### Step 4: Deploy

1. Click "Create Web Service"
2. Render will automatically deploy your application
3. Once deployed, your service will be available at `https://your-service-name.onrender.com`

### Step 5: Configure TrackerRMS Webhook

1. Log in to your TrackerRMS admin panel
2. Navigate to Webhooks or Integrations
3. Create a new webhook with:
   - **URL:** `https://your-service-name.onrender.com/webhook`
   - **Events:** Select the following:
     - Opportunity.Created
     - Opportunity.Updated
     - OpportunityResource.Created
     - OpportunityResource.Updated
   - **Secret:** (Optional) The same value as `WEBHOOK_SECRET` in Render

## Deploy to Other Platforms

### Heroku

1. Create a new Heroku app
2. Set environment variables using `heroku config:set`
3. Deploy using Git:
   ```bash
   heroku git:remote -a your-app-name
   git push heroku main
   ```

### AWS Elastic Beanstalk

1. Create a new Node.js environment
2. Configure environment variables in the EB console
3. Deploy using the EB CLI:
   ```bash
   eb init
   eb create production-env
   eb deploy
   ```

### Docker

Build and run the Docker container:

```bash
# Build image
docker build -t hubspot-tracker-sync .

# Run container
docker run -d \
  -p 3000:3000 \
  -e HUBSPOT_ACCESS_TOKEN=your_token \
  -e TRACKER_API_URL=your_url \
  -e TRACKER_API_KEY=your_key \
  hubspot-tracker-sync
```

## Monitoring

### Health Checks

The service exposes a health check endpoint at `/health`:

```bash
curl https://your-service-name.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Logs

Monitor application logs to track:
- Webhook events received
- Sync operations (success/failure)
- API call retries
- Error messages

On Render, view logs in the dashboard or use the CLI:
```bash
render logs -a your-service-name
```

### Key Metrics to Monitor

- Webhook event processing rate
- Success/failure rates for syncs
- API response times
- Retry attempts
- Error frequency

## Scaling Considerations

### Idempotency Store

The current implementation uses an in-memory store for idempotency tracking. For production at scale, consider:

1. **Redis** - Fast, distributed cache
2. **Database** - PostgreSQL, MySQL for persistent storage
3. **DynamoDB** - AWS-managed NoSQL database

Example Redis implementation:
```typescript
import Redis from 'ioredis';

class RedisIdempotencyStore {
  private redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url);
  }

  async hasProcessed(eventId: string): Promise<boolean> {
    return (await this.redis.exists(eventId)) === 1;
  }

  async markAsProcessed(eventId: string, status: string, error?: string): Promise<void> {
    await this.redis.setex(
      eventId,
      86400, // 24 hours TTL
      JSON.stringify({ status, error, processedAt: new Date() })
    );
  }
}
```

### Rate Limiting

Consider implementing rate limiting to protect against excessive webhook calls:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

app.use('/webhook', limiter);
```

### Horizontal Scaling

The service is stateless (except for in-memory idempotency store) and can be scaled horizontally by running multiple instances behind a load balancer.

## Troubleshooting

### Webhook not receiving events

1. Verify the webhook URL is correct in TrackerRMS
2. Check that the service is running and accessible
3. Verify webhook signature (if enabled)

### Sync failures

1. Check API credentials are correct
2. Verify custom objects exist in HubSpot
3. Review logs for specific error messages
4. Ensure network connectivity to both APIs

### Association failures

1. Verify the deal/company/ticket IDs exist in HubSpot
2. Check association type IDs are correct for your HubSpot account
3. Review error logs for specific association failures

## Security Best Practices

1. **Use HTTPS** - Always deploy with SSL/TLS enabled
2. **Rotate Credentials** - Regularly rotate API keys and tokens
3. **Webhook Signature** - Enable webhook signature validation
4. **Rate Limiting** - Implement rate limiting to prevent abuse
5. **Logging** - Log security events but never log sensitive data
6. **Environment Variables** - Never commit secrets to version control
7. **Network Security** - Use VPC/private networks where possible

## Support

For issues or questions:
1. Check the logs for error details
2. Review the README.md for configuration guidance
3. Open an issue on GitHub
