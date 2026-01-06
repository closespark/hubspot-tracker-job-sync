# Example Webhook Payloads

This directory contains example webhook payloads for testing the service.

## Opportunity.Created

```json
{
  "eventType": "Opportunity.Created",
  "eventId": "evt_opp_created_123",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "opportunityId": "opp_12345"
  }
}
```

## Opportunity.Updated

```json
{
  "eventType": "Opportunity.Updated",
  "eventId": "evt_opp_updated_456",
  "timestamp": "2024-01-01T12:05:00Z",
  "data": {
    "opportunityId": "opp_12345"
  }
}
```

## OpportunityResource.Created

```json
{
  "eventType": "OpportunityResource.Created",
  "eventId": "evt_resource_created_789",
  "timestamp": "2024-01-01T13:00:00Z",
  "data": {
    "opportunityResourceId": "resource_67890"
  }
}
```

## OpportunityResource.Updated

```json
{
  "eventType": "OpportunityResource.Updated",
  "eventId": "evt_resource_updated_012",
  "timestamp": "2024-01-01T13:05:00Z",
  "data": {
    "opportunityResourceId": "resource_67890"
  }
}
```

## Testing with curl

### Without webhook signature:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Opportunity.Created",
    "eventId": "evt_test_123",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "opportunityId": "opp_12345"
    }
  }'
```

### With webhook signature:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: your_webhook_secret" \
  -d '{
    "eventType": "Opportunity.Created",
    "eventId": "evt_test_456",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "opportunityId": "opp_12345"
    }
  }'
```

## Testing Idempotency

Send the same event twice to verify idempotency:

```bash
# First request
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Opportunity.Created",
    "eventId": "idempotent_test_123",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "opportunityId": "opp_12345"
    }
  }'

# Second request with same eventId
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Opportunity.Created",
    "eventId": "idempotent_test_123",
    "timestamp": "2024-01-01T12:00:00Z",
    "data": {
      "opportunityId": "opp_12345"
    }
  }'
```

The second request should return:
```json
{
  "status": "already_processed",
  "processedAt": "2024-01-01T12:00:00.000Z"
}
```
