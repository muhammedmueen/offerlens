# Changelog: Rate Limit Error UI

## Changes Made

### 1. Backend Error Detection & Formatting

#### `backend/src/providers/ai/gemini.ai.ts`
- Added specific error detection for rate limits (429 status)
- Added error detection for quota exceeded
- Added error detection for invalid requests (400 status)
- Throws `AppError` with descriptive messages
- Logs errors with context for debugging

#### `backend/src/workers/analysis.worker.ts`
- Catches errors from AI provider
- Categorizes errors into types:
  - `RATE_LIMIT:` - Rate limit or quota exceeded
  - `INVALID_REQUEST:` - Bad request to AI model
  - `AI_ERROR:` - Internal AI service error
- Stores formatted error message in database
- Logs error type for monitoring

#### `backend/src/workers/ocr.worker.ts`
- Added rate limit detection during OCR processing
- Stores formatted error message
- Prevents silent failures

#### `backend/src/modules/offer/offer.service.ts`
- Updated `getById()` to return `failureReason`
- Exposes error details to frontend

#### `backend/src/modules/offer/offer.types.ts`
- Added `failureReason?: string | null` to `OfferResponse` interface

### 2. Frontend Error Display

#### `frontend/src/pages/ProcessingPage.tsx`
- Added `getErrorMessage()` function to parse error types
- Added `isRateLimitError` detection
- Created custom error UI for failed offers
- Shows specific error message from backend
- Displays helpful tips for rate limit errors:
  - Wait 2-3 minutes before retrying
  - Switch to a different AI model
  - Use the model selector
- Added "Change Model" button for rate limit errors
- Improved visual design with icons and styling

### 3. Documentation

#### `docs/error-handling.md`
- Complete guide to error handling flow
- Error type definitions and triggers
- UI mockups for each error type
- Implementation details with code examples
- Testing procedures
- Monitoring and best practices

#### `docs/api-consumption-analysis.md`
- Updated with error handling information
- Added troubleshooting section

## Error Message Examples

### Rate Limit Error
**Backend stores:**
```
RATE_LIMIT: API rate limit exceeded. Please wait a few minutes and try again, or switch to a different model.
```

**Frontend displays:**
```
Rate Limit Exceeded

API rate limit exceeded. Please wait a few minutes and try again, 
or switch to a different model.

💡 Tips to avoid rate limits:
• Wait 2-3 minutes before trying again
• Switch to a different AI model (e.g., gemini-flash-lite-latest)
• Use the model selector in the upload form

[Try Again] [Change Model]
```

### Invalid Request Error
**Backend stores:**
```
INVALID_REQUEST: The AI model encountered an error processing your offer. Please try a different model.
```

**Frontend displays:**
```
Analysis Failed

The AI model encountered an error processing your offer. 
Please try a different model.

[Try Again]
```

### AI Service Error
**Backend stores:**
```
AI_ERROR: The AI service encountered an internal error. Please try again.
```

**Frontend displays:**
```
Analysis Failed

The AI service encountered an internal error. Please try again.

[Try Again]
```

## Testing

### Test Rate Limit Error
1. Make 10+ rapid requests to trigger rate limit
2. Observe error in ProcessingPage
3. Verify helpful tips are shown
4. Verify "Change Model" button appears
5. Check database for proper error storage

### Test Error Recovery
1. Trigger rate limit error
2. Wait 2-3 minutes
3. Click "Try Again"
4. Verify successful processing

### Test Model Switching
1. Trigger rate limit error with one model
2. Click "Change Model"
3. Select different model in upload form
4. Verify successful processing with new model

## Database Schema

No schema changes required. Uses existing `failure_reason` column:
```sql
CREATE TABLE offers (
  ...
  failure_reason TEXT,
  ...
);
```

## API Changes

### Response Format
The `/offers/:id` endpoint now includes `failureReason`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "FAILED",
    "failureReason": "RATE_LIMIT: API rate limit exceeded...",
    "createdAt": "2026-02-15T...",
    "isGuest": true
  }
}
```

## User Experience Improvements

### Before
- Generic "Analysis failed" message
- No indication of what went wrong
- No guidance on how to fix
- Same UI for all error types

### After
- Specific error messages (rate limit, invalid request, etc.)
- Clear explanation of the problem
- Actionable tips to resolve the issue
- Special UI for rate limit errors with helpful guidance
- "Change Model" button for quick recovery

## Monitoring

### Logs to Check
```bash
# Rate limit errors
grep "RATE_LIMIT" backend/logs/*.log

# All analysis failures
grep "Analysis.*failed" backend/logs/*.log

# Gemini API errors
grep "Gemini AI.*failed" backend/logs/*.log
```

### Database Queries
```sql
-- Recent failures
SELECT id, status, failure_reason, created_at 
FROM offers 
WHERE status = 'FAILED' 
ORDER BY created_at DESC 
LIMIT 10;

-- Failures by type
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

## Next Steps

1. Test with actual rate limit scenarios
2. Monitor error rates in production
3. Consider adding retry logic with exponential backoff
4. Add error analytics dashboard
5. Implement circuit breaker for failing models
6. Add user notifications for long-running failures
