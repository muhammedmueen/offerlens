# API Consumption Analysis

## Overview
This document explains how many API requests are consumed when processing an offer letter.

## Request Breakdown Per Offer

### 1. Frontend Upload (1 HTTP request)
- **Endpoint**: `POST /api/v1/offers`
- **Purpose**: Submit offer letter with extracted text and metadata
- **Cost**: Free (your backend)

### 2. Metadata Extraction (1 Gemini API call)
- **Location**: `backend/src/modules/offer/offer.service.ts` → `extractMetadataFromText()`
- **Model**: `gemini-flash-lite-latest` (lightweight, fast)
- **Purpose**: Extract role, city, experience level, CTC from text
- **Input**: ~2000 characters of offer text
- **Output**: JSON with 5 fields
- **Cost**: 1 Gemini API request

### 3. OCR Worker Processing (0 Gemini API calls)
- **Location**: `backend/src/workers/ocr.worker.ts`
- **Purpose**: Process text and queue for analysis
- **Cost**: Free (just database operations)

### 4. Full Analysis (1 Gemini API call)
- **Location**: `backend/src/workers/analysis.worker.ts` → `aiProvider.analyzeOffer()`
- **Model**: User-selected (default: `gemini-flash-latest`)
- **Purpose**: Complete offer analysis with red flags, salary comparison, benefits, etc.
- **Input**: Full offer text + user context
- **Output**: Complete AnalysisResult JSON (~2-4KB)
- **Cost**: 1 Gemini API request

### 5. Frontend Polling (Multiple HTTP requests)
- **Endpoint**: `GET /api/v1/offers/:id`
- **Frequency**: Every 3 seconds until COMPLETED/FAILED
- **Duration**: Typically 15-30 seconds (5-10 requests)
- **Purpose**: Check processing status
- **Cost**: Free (your backend, just database reads)

## Total API Consumption

### Per Successful Offer
- **Gemini API calls**: 2 (1 metadata + 1 analysis)
- **Your backend HTTP requests**: ~12-15 (1 upload + 10-14 polling)

### Per Failed Offer (with retry)
- **Gemini API calls**: 4 (2 for failed attempt + 2 for retry)
- **Your backend HTTP requests**: ~25-30

## Rate Limits

### Gemini Free Tier (as of Feb 2026)
- **gemini-flash-latest**: 15 requests/minute, 1500 requests/day
- **gemini-flash-lite-latest**: 15 requests/minute, 1500 requests/day
- **gemini-2.5-flash**: 10 requests/minute, 1000 requests/day
- **gemini-2.5-pro**: 2 requests/minute, 50 requests/day

### Practical Limits
With 2 Gemini calls per offer:
- **gemini-flash-latest**: ~750 offers/day, ~7 offers/minute
- **gemini-2.5-pro**: ~25 offers/day, 1 offer/minute

## Why You Hit Rate Limits

If you tested 3 offers in 5 minutes and hit rate limits, here's why:

1. **3 successful offers** = 6 Gemini API calls
2. **Any failed offers** = 2 more calls per failure
3. **Previous tests** in the same time window count
4. **Metadata extraction during upload** = 1 call per upload attempt

Example scenario:
- Upload attempt 1: 1 metadata call (failed extraction)
- Upload attempt 2: 1 metadata call + 1 analysis call = 2 calls
- Upload attempt 3: 1 metadata call + 1 analysis call = 2 calls
- Upload attempt 4: 1 metadata call + 1 analysis call = 2 calls
- **Total**: 7 calls in ~5 minutes

If using `gemini-2.0-flash` (10 requests/minute limit), you're close to the limit.

## Model Selector Feature

### Purpose
The model selector dropdown (added in Task 8) allows you to:
1. Switch between models when you hit rate limits
2. Test different models for quality comparison
3. Use faster/cheaper models for development

### Available Models
- `gemini-2.5-flash`: Latest, fastest, best quality
- `gemini-2.5-pro`: Most capable, slower, stricter limits
- `gemini-2.0-flash`: Previous generation, good balance
- `gemini-flash-latest`: Auto-updated to latest flash model
- `gemini-flash-lite-latest`: Lightweight, fastest, good for testing
- `gemini-pro-latest`: Auto-updated to latest pro model
- `gemini-1.5-flash`: Stable older version
- `gemini-1.5-pro`: Stable older pro version

### How It Works
1. User selects model in upload form
2. Model name sent with FormData: `formData.append("model", selectedModel)`
3. Backend extracts model: `fields.model || 'gemini-flash-latest'`
4. Model passed through queue: OCR worker → Analysis worker
5. Analysis worker uses specified model: `aiProvider.analyzeOffer(text, context, model)`
6. Gemini provider creates model instance dynamically

### Best Practices
- Use `gemini-flash-lite-latest` for rapid testing (fastest, highest limits)
- Use `gemini-flash-latest` for production (good balance)
- Use `gemini-2.5-pro` for highest quality analysis (slowest, lowest limits)
- Switch models when you see 429 rate limit errors

## Optimization Tips

### Reduce API Consumption
1. **Cache metadata extraction**: Store extracted metadata to avoid re-extraction
2. **Batch processing**: Process multiple offers in sequence with delays
3. **Implement retry with backoff**: Wait before retrying failed offers
4. **Use lite models for testing**: Switch to `gemini-flash-lite-latest` during development

### Avoid Rate Limits
1. **Add delays between uploads**: Wait 10-15 seconds between test uploads
2. **Delete failed offers**: System already does this to allow retries
3. **Monitor usage**: Log API calls to track consumption
4. **Use different models**: Rotate between models to distribute load

### Production Considerations
1. **Upgrade to paid tier**: Get higher rate limits
2. **Implement queue throttling**: Limit concurrent analysis jobs
3. **Add user rate limiting**: Prevent abuse
4. **Cache common analyses**: Store results for identical offers

## Monitoring

### Check Current Usage
```bash
# Check Gemini API quota in Google Cloud Console
# Navigate to: APIs & Services → Gemini API → Quotas
```

### Log Analysis
```bash
# Backend logs show each API call
grep "Gemini AI" backend/logs/*.log
grep "Analysis Worker" backend/logs/*.log
```

### Database Queries
```sql
-- Count offers by status
SELECT status, COUNT(*) FROM offers GROUP BY status;

-- Check recent failures
SELECT id, status, failure_reason, created_at 
FROM offers 
WHERE status = 'FAILED' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Summary

**Each offer consumes exactly 2 Gemini API calls:**
1. Metadata extraction (lightweight, fast)
2. Full analysis (comprehensive, slower)

**Rate limits are per-minute and per-day**, so spacing out your tests helps avoid hitting limits. The model selector feature gives you flexibility to switch models when needed.
