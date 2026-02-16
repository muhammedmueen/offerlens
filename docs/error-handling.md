# Error Handling Guide

## Overview
This document explains how errors are handled and displayed in the application, with special focus on rate limit errors.

## Error Flow

### 1. Error Detection (Backend)
Errors are caught at multiple levels:

#### Gemini AI Provider (`backend/src/providers/ai/gemini.ai.ts`)
- Detects HTTP status codes (429, 400, 500)
- Checks error messages for keywords: "rate limit", "quota", "429"
- Throws `AppError` with specific error codes

#### Workers (`backend/src/workers/*.worker.ts`)
- Catch errors from AI provider
- Parse error messages to categorize error types
- Store formatted error in database with prefix:
  - `RATE_LIMIT:` - API rate limit exceeded
  - `INVALID_REQUEST:` - Bad request to AI model
  - `AI_ERROR:` - Internal AI service error

### 2. Error Storage (Database)
Errors are stored in the `offers` table:
```typescript
{
  status: 'FAILED',
  failureReason: 'RATE_LIMIT: API rate limit exceeded. Please wait a few minutes and try again, or switch to a different model.'
}
```

### 3. Error Retrieval (API)
The `/offers/:id` endpoint returns the failure reason:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "FAILED",
    "failureReason": "RATE_LIMIT: API rate limit exceeded...",
    ...
  }
}
```

### 4. Error Display (Frontend)
The ProcessingPage component:
1. Polls the offer status every 3 seconds
2. Detects `FAILED` status
3. Parses `failureReason` to extract error type
4. Shows appropriate UI with helpful tips

## Error Types

### Rate Limit Error (429)

**Triggers:**
- Too many API requests in short time
- Gemini API quota exceeded
- Model-specific rate limits hit

**Detection:**
```typescript
// In Gemini provider
if (error.status === 429 || error.message?.includes('429') || error.message?.includes('quota')) {
  throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Rate limit exceeded...', 429, error);
}

// In worker
if (error.message?.includes('429') || error.message?.includes('rate limit')) {
  failureReason = 'RATE_LIMIT: API rate limit exceeded. Please wait...';
}
```

**UI Display:**
```
┌─────────────────────────────────────┐
│         Rate Limit Exceeded         │
│                                     │
│  API rate limit exceeded. Please   │
│  wait a few minutes and try again, │
│  or switch to a different model.   │
│                                     │
│  💡 Tips to avoid rate limits:     │
│  • Wait 2-3 minutes before trying  │
│  • Switch to a different AI model  │
│  • Use the model selector          │
│                                     │
│  [Try Again] [Change Model]        │
└─────────────────────────────────────┘
```

### Invalid Request Error (400)

**Triggers:**
- Model doesn't support requested features
- Invalid prompt format
- Schema validation errors

**Detection:**
```typescript
if (error.status === 400 || error.message?.includes('400')) {
  throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Invalid request to AI model...', 400, error);
}
```

**UI Display:**
```
┌─────────────────────────────────────┐
│         Analysis Failed             │
│                                     │
│  Invalid request to AI model.      │
│  Please try a different model.     │
│                                     │
│  [Try Again]                       │
└─────────────────────────────────────┘
```

### AI Service Error (500)

**Triggers:**
- Internal Gemini API errors
- Network timeouts
- Unexpected failures

**Detection:**
```typescript
if (error.status === 500 || error.message?.includes('internal')) {
  failureReason = 'AI_ERROR: The AI service encountered an internal error...';
}
```

**UI Display:**
```
┌─────────────────────────────────────┐
│         Analysis Failed             │
│                                     │
│  The AI service encountered an     │
│  internal error. Please try again. │
│                                     │
│  [Try Again]                       │
└─────────────────────────────────────┘
```

## Implementation Details

### Backend Error Handling

#### Analysis Worker
```typescript
try {
  const result = await aiProvider.analyzeOffer(text, context, model);
  // ... process result
} catch (error: any) {
  let failureReason = error.message || 'Analysis failed';
  
  // Categorize error
  if (error.message?.includes('429') || error.message?.includes('rate limit')) {
    failureReason = 'RATE_LIMIT: API rate limit exceeded. Please wait...';
  } else if (error.message?.includes('400')) {
    failureReason = 'INVALID_REQUEST: The AI model encountered an error...';
  } else if (error.message?.includes('500')) {
    failureReason = 'AI_ERROR: The AI service encountered an internal error...';
  }
  
  // Store in database
  await db.update(offers).set({
    status: 'FAILED',
    failureReason: failureReason
  }).where(eq(offers.id, offerId));
  
  throw error;
}
```

#### Gemini Provider
```typescript
try {
  const result = await analysisModel.generateContent(prompt);
  return result;
} catch (error: any) {
  // Check for specific error types
  if (error.status === 429 || error.message?.includes('429')) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Rate limit exceeded. Please wait a few minutes or try a different model.',
      429,
      error
    );
  }
  // ... other error types
}
```

### Frontend Error Display

#### ProcessingPage Component
```typescript
const getErrorMessage = (failureReason?: string | null) => {
  if (!failureReason) return "Analysis failed. Please try again.";
  
  // Remove error type prefix for display
  if (failureReason.startsWith('RATE_LIMIT:')) {
    return failureReason.replace('RATE_LIMIT: ', '');
  } else if (failureReason.startsWith('INVALID_REQUEST:')) {
    return failureReason.replace('INVALID_REQUEST: ', '');
  } else if (failureReason.startsWith('AI_ERROR:')) {
    return failureReason.replace('AI_ERROR: ', '');
  }
  
  return failureReason;
};

const isRateLimitError = data?.failureReason?.includes('RATE_LIMIT');

// Show special UI for rate limit errors
if (data?.status === OFFER_STATUS.FAILED) {
  return (
    <div>
      <h2>{isRateLimitError ? "Rate Limit Exceeded" : "Analysis Failed"}</h2>
      <p>{getErrorMessage(data.failureReason)}</p>
      
      {isRateLimitError && (
        <div>
          <p>💡 Tips to avoid rate limits:</p>
          <ul>
            <li>Wait 2-3 minutes before trying again</li>
            <li>Switch to a different AI model</li>
            <li>Use the model selector in the upload form</li>
          </ul>
        </div>
      )}
      
      <Button onClick={() => navigate("/upload")}>Try Again</Button>
      {isRateLimitError && (
        <Button onClick={() => navigate("/upload")}>Change Model</Button>
      )}
    </div>
  );
}
```

## Testing Error Handling

### Simulate Rate Limit Error
1. Make 10+ rapid requests to trigger rate limit
2. Check that error is caught and stored correctly
3. Verify UI shows rate limit message with tips

### Simulate Invalid Request Error
1. Use an invalid model name
2. Check that error is caught and categorized
3. Verify UI shows appropriate message

### Check Database
```sql
-- View recent failures
SELECT id, status, failure_reason, created_at 
FROM offers 
WHERE status = 'FAILED' 
ORDER BY created_at DESC 
LIMIT 10;

-- Count failures by type
SELECT 
  CASE 
    WHEN failure_reason LIKE 'RATE_LIMIT:%' THEN 'Rate Limit'
    WHEN failure_reason LIKE 'INVALID_REQUEST:%' THEN 'Invalid Request'
    WHEN failure_reason LIKE 'AI_ERROR:%' THEN 'AI Error'
    ELSE 'Other'
  END as error_type,
  COUNT(*) as count
FROM offers 
WHERE status = 'FAILED'
GROUP BY error_type;
```

## Best Practices

### For Users
1. **Rate Limits**: Wait 2-3 minutes between retries
2. **Model Selection**: Try different models if one fails
3. **Peak Times**: Avoid testing during peak hours

### For Developers
1. **Error Messages**: Always include actionable advice
2. **Logging**: Log full error details for debugging
3. **Monitoring**: Track error rates by type
4. **Retry Logic**: Don't auto-retry rate limit errors
5. **User Feedback**: Show progress and clear error messages

## Monitoring

### Key Metrics to Track
- Rate limit errors per hour
- Failed offers by error type
- Average time to failure
- Retry success rate

### Alerts to Set Up
- Rate limit errors > 10/hour
- Failed offers > 20% of total
- Specific model consistently failing

### Logs to Review
```bash
# Check for rate limit errors
grep "RATE_LIMIT" backend/logs/*.log

# Check Gemini API errors
grep "Gemini AI.*failed" backend/logs/*.log

# Check worker failures
grep "Analysis.*failed" backend/logs/*.log
```

## Future Improvements

1. **Exponential Backoff**: Automatically retry with increasing delays
2. **Circuit Breaker**: Temporarily disable failing models
3. **Fallback Models**: Auto-switch to alternative model on failure
4. **User Notifications**: Email/SMS when processing completes or fails
5. **Error Analytics**: Dashboard showing error trends
6. **Smart Routing**: Route requests to least-loaded models
