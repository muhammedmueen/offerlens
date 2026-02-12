# Integration Fixes - Design Document

## 1. Architecture Overview

### 1.1 Current State (Broken)
```
Frontend                    Backend
┌─────────────┐            ┌──────────────┐
│ Upload Form │──POST /analyze──X (404)
│             │            │              │
│             │──POST /offers──✓ (202)   │
│             │            │              │
│ Results     │──GET /roles──X (404)     │
│ Page        │            │              │
│             │──GET /offers/:id──✓      │
│             │            │              │
│             │  (No polling)             │
└─────────────┘            └──────────────┘
```

### 1.2 Target State (Fixed)
```
Frontend                         Backend
┌─────────────┐                 ┌──────────────┐
│ Upload Form │──POST /api/v1/offers──✓ (202)
│             │                 │              │
│ Results     │──GET /api/v1/offers/:id (poll)
│ Page        │    ↓ QUEUED    │              │
│             │    ↓ PROCESSING│              │
│             │    ↓ COMPLETED │              │
│             │                 │              │
│             │──GET /api/v1/metadata/roles──✓
│             │──GET /api/v1/metadata/cities──✓
└─────────────┘                 └──────────────┘
```

---

## 2. Component Design

### 2.1 Frontend API Client

#### 2.1.1 Current Implementation
```typescript
// frontend/lib/api/client.ts
const DEFAULT_CONFIG = {
  baseURL: 'http://localhost:3001/api/v1',  // ❌ Includes prefix
  // ...
}

// frontend/lib/api/endpoints.ts
apiClient.get('/roles')  // ❌ Calls /roles, not /api/v1/metadata/roles
```

#### 2.1.2 Fixed Implementation
```typescript
// frontend/lib/api/client.ts
const DEFAULT_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  // ...
}

// frontend/lib/api/endpoints.ts
apiClient.get('/api/v1/metadata/roles')  // ✅ Full path
```

**Rationale**: Keep baseURL clean, use full paths in endpoint calls for clarity.

### 2.2 Upload Flow

#### 2.2.1 Current Flow (Broken)
```typescript
handleAnalyze() {
  // 1. Upload file → get offer ID
  const offer = await uploadOffer(file)
  
  // 2. Try to analyze synchronously ❌
  const analysis = await analyzeOffer({...})  // 404 error
  
  // 3. Navigate to results
  router.push('/results')
}
```

#### 2.2.2 Fixed Flow
```typescript
handleAnalyze() {
  // 1. Upload file → get offer ID
  const offer = await uploadOffer(file)
  
  // 2. Navigate to results with ID (no sync analysis)
  router.push(`/results?id=${offer.id}`)
  
  // 3. Results page polls for completion
}
```

**Rationale**: Embrace async architecture, let backend process in background.

### 2.3 Results Page Polling

#### 2.3.1 Polling State Machine
```
┌─────────┐
│ LOADING │ (Fetching initial status)
└────┬────┘
     │
     ▼
┌─────────┐
│ QUEUED  │ (Waiting in queue)
└────┬────┘
     │ Poll every 2s
     ▼
┌────────────┐
│ PROCESSING │ (AI analyzing)
└─────┬──────┘
      │ Poll every 2s → 4s → 8s → 10s (max)
      │
      ├──▶ ┌───────────┐
      │    │ COMPLETED │ (Show results)
      │    └───────────┘
      │
      └──▶ ┌────────┐
           │ FAILED │ (Show error + retry)
           └────────┘
```

#### 2.3.2 Implementation
```typescript
// frontend/components/results/results-content.tsx
const [pollInterval, setPollInterval] = useState(2000)
const [pollCount, setPollCount] = useState(0)

useEffect(() => {
  if (!id || currentOffer?.status === 'COMPLETED') return
  
  const poll = async () => {
    const offer = await getOffer(id)
    
    if (offer.status === 'COMPLETED') {
      // Fetch and display analysis
      setOffer(offer.analysis, extractDetails(offer))
      return
    }
    
    if (offer.status === 'FAILED') {
      setError(offer.failureReason)
      return
    }
    
    // Exponential backoff
    setPollCount(c => c + 1)
    if (pollCount > 0) {
      setPollInterval(prev => Math.min(prev * 2, 10000))
    }
    
    // Timeout after 5 minutes
    if (pollCount > 60) {
      setError('Analysis timed out. Please try again.')
      return
    }
    
    // Schedule next poll
    setTimeout(poll, pollInterval)
  }
  
  poll()
}, [id])
```

**Rationale**: 
- Start with 2s for quick feedback
- Exponential backoff reduces server load
- 10s max prevents excessive polling
- 5min timeout prevents infinite loops

---

## 3. Data Contract Design

### 3.1 Backend DTO

#### 3.1.1 Schema Relationship
```
offers (1) ──────── (1) analyses
  │                      │
  ├─ id                  ├─ id
  ├─ status              ├─ offerId (FK)
  ├─ rawText             ├─ score
  ├─ ocrConfidence       ├─ extractedData
  └─ ...                 └─ ...
```

#### 3.1.2 DTO Structure
```typescript
// backend/src/modules/offer/offer.dto.ts
export interface OfferWithAnalysisDTO {
  // From offers table
  id: string
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  isGuest: boolean
  ocrConfidence: number | null
  lowConfidence: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  
  // From analyses table (null if not COMPLETED)
  analysis: {
    score: number
    scoreLabel: string
    scoringMethod: string
    extractedData: ExtractedData
    redFlags: RedFlag[]
    salaryComparison: SalaryComparison
    negotiationSuggestions: Suggestion[]
    benefits: Benefit[]
    takeHome: TakeHome | null
    aiMetadata: AIMetadata
    processingTimeMs: number | null
  } | null
  
  // Error info (if FAILED)
  failureReason: string | null
}
```

#### 3.1.3 Service Implementation
```typescript
// backend/src/modules/offer/offer.service.ts
async getById(id: string): Promise<OfferWithAnalysisDTO | null> {
  const offer = await this.db.query.offers.findFirst({
    where: eq(offers.id, id),
    with: {
      analysis: true  // Join with analyses table
    }
  })
  
  if (!offer) return null
  
  return {
    id: offer.id,
    status: offer.status,
    isGuest: offer.isGuest,
    ocrConfidence: offer.ocrConfidence,
    lowConfidence: offer.ocrConfidence ? offer.ocrConfidence < 0.6 : false,
    expiresAt: offer.expiresAt?.toISOString() ?? null,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
    analysis: offer.analysis ? {
      score: offer.analysis.score,
      scoreLabel: offer.analysis.scoreLabel,
      scoringMethod: offer.analysis.scoringMethod,
      extractedData: offer.analysis.extractedData as ExtractedData,
      redFlags: offer.analysis.redFlags as RedFlag[],
      salaryComparison: offer.analysis.salaryComparison as SalaryComparison,
      negotiationSuggestions: offer.analysis.negotiationSuggestions as Suggestion[],
      benefits: offer.analysis.benefits as Benefit[],
      takeHome: offer.analysis.takeHome as TakeHome | null,
      aiMetadata: offer.analysis.aiMetadata as AIMetadata,
      processingTimeMs: offer.analysis.processingTimeMs
    } : null,
    failureReason: offer.failureReason
  }
}
```

**Rationale**: 
- Single endpoint returns all needed data
- Null analysis when not ready (clear contract)
- Type-safe with proper casting

### 3.2 Frontend Type Alignment

```typescript
// frontend/lib/api/types.ts
export interface OfferResponse {
  id: string
  status: OfferStatus
  isGuest: boolean
  ocrConfidence: number | null
  lowConfidence: boolean
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  analysis: {
    score: number
    scoreLabel: string
    scoringMethod: string
    extractedData: ExtractedOfferData
    redFlags: DetectedRedFlag[]
    salaryComparison: SalaryComparison
    negotiationSuggestions: NegotiationSuggestion[]
    benefits: Benefit[]
    takeHome: TakeHome | null
    aiMetadata: {
      analysisVersion: string
      modelUsed: string
      processingNote: string | null
    }
    processingTimeMs: number | null
  } | null
  failureReason: string | null
}
```

**Rationale**: Exact match with backend DTO prevents mapping errors.

---

## 4. Error Handling Design

### 4.1 Error States

| State | Trigger | UI Display | User Action |
|---|---|---|---|
| **Loading** | Initial fetch | Spinner + "Loading analysis..." | Wait |
| **Queued** | status = QUEUED | Progress bar + "Queued for analysis..." | Wait |
| **Processing** | status = PROCESSING | Animated spinner + "Analyzing your offer..." | Wait |
| **Completed** | status = COMPLETED | Show results | View/export |
| **Failed** | status = FAILED | Error icon + failureReason | Retry button |
| **Timeout** | 5min elapsed | Warning + "Analysis timed out" | Retry button |
| **Network Error** | Fetch fails | Error + "Connection lost" | Auto-retry |

### 4.2 Error Recovery

```typescript
// Retry logic for failed analysis
const handleRetry = async () => {
  try {
    // Re-upload or re-analyze
    const result = await reanalyzeOffer(offerId, offerDetails)
    router.push(`/results?id=${result.id}`)
  } catch (error) {
    setError('Retry failed. Please try again later.')
  }
}
```

---

## 5. Code Removal Design

### 5.1 Functions to Remove

```typescript
// ❌ DELETE from frontend/lib/api/endpoints.ts
export async function analyzeOffer(data: AnalyzeRequest): Promise<AnalyzeResponse>
export async function extractText(file: File): Promise<TextExtractionResponse>
export async function submitCorrections(id: string, corrections: any): Promise<OfferResponse>
export async function negotiateOffer(id: string, email: string): Promise<any>
```

### 5.2 Types to Remove

```typescript
// ❌ DELETE from frontend/lib/api/types.ts (if not used elsewhere)
export interface AnalyzeRequest
export interface TextExtractionResponse
```

### 5.3 Components to Remove

```typescript
// ❌ DELETE from frontend/components/results/results-content.tsx
import { EmailGatedContent } from "@/components/negotiation/EmailGatedContent"

// Remove this section:
{(currentOffer.analysisId || (currentOffer as any).id) && (
  <div className="mt-8">
    <EmailGatedContent
      offerId={(currentOffer as any).id || currentOffer.analysisId}
      title="Get Your Full Negotiation Script"
    />
  </div>
)}
```

**Rationale**: Clean up dead code to reduce confusion and maintenance burden.

---

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
// frontend/__tests__/api/polling.test.ts
describe('Polling Logic', () => {
  it('should poll every 2s initially', async () => {
    // Test initial interval
  })
  
  it('should use exponential backoff', async () => {
    // Test 2s → 4s → 8s → 10s
  })
  
  it('should stop after COMPLETED', async () => {
    // Test polling stops
  })
  
  it('should timeout after 5 minutes', async () => {
    // Test timeout
  })
})
```

### 6.2 Integration Tests

```typescript
// frontend/__tests__/integration/upload-flow.test.ts
describe('Upload to Results Flow', () => {
  it('should complete full flow', async () => {
    // 1. Upload file
    const { offerId } = await uploadOffer(mockFile)
    
    // 2. Navigate to results
    router.push(`/results?id=${offerId}`)
    
    // 3. Mock polling responses
    mockGetOffer
      .mockResolvedValueOnce({ status: 'QUEUED' })
      .mockResolvedValueOnce({ status: 'PROCESSING' })
      .mockResolvedValueOnce({ status: 'COMPLETED', analysis: {...} })
    
    // 4. Verify results display
    await waitFor(() => {
      expect(screen.getByText('Analysis Complete')).toBeInTheDocument()
    })
  })
})
```

---

## 7. Deployment Strategy

### 7.1 Rollout Plan

**Phase 1: Backend Changes** (1 hour)
1. Add DTO interface
2. Update `OfferService.getById()` to join tables
3. Test endpoint returns correct data
4. Deploy to staging

**Phase 2: Frontend Changes** (2 hours)
1. Fix API client baseURL
2. Update all endpoint paths
3. Remove legacy analyze code
4. Update types
5. Test locally against staging backend

**Phase 3: Polling Implementation** (2 hours)
1. Add polling logic to results page
2. Add error states
3. Test all scenarios
4. Deploy to staging

**Phase 4: Testing & Cleanup** (2 hours)
1. Run integration tests
2. Manual QA testing
3. Remove dead code
4. Code review
5. Deploy to production

### 7.2 Rollback Plan

If issues occur:
1. Revert frontend deployment (keeps old flow)
2. Backend changes are backward compatible (no rollback needed)
3. Monitor error logs
4. Fix issues and redeploy

---

## 8. Monitoring & Observability

### 8.1 Metrics to Track

- **Upload Success Rate**: % of uploads that return 202
- **Analysis Completion Rate**: % of offers that reach COMPLETED
- **Average Analysis Time**: Time from QUEUED to COMPLETED
- **Polling Efficiency**: Average number of polls per analysis
- **Error Rate**: % of offers that reach FAILED
- **Timeout Rate**: % of analyses that timeout

### 8.2 Logging

```typescript
// Add logging to polling
console.log('[Polling]', {
  offerId,
  status,
  pollCount,
  interval: pollInterval,
  elapsed: Date.now() - startTime
})
```

---

## 9. Performance Considerations

### 9.1 Polling Optimization

- **Exponential Backoff**: Reduces server load as analysis progresses
- **Max Interval**: 10s prevents excessive delays
- **Timeout**: 5min prevents infinite loops
- **Cleanup**: Clear intervals on unmount

### 9.2 Data Transfer

- **Single Endpoint**: One call returns all data (no N+1 queries)
- **Conditional Analysis**: Only fetch analysis when COMPLETED
- **Caching**: Use React Query for automatic caching

---

## 10. Security Considerations

### 10.1 No Changes Required

All security measures remain unchanged:
- Guest fingerprint tracking
- Rate limiting
- Input validation
- SQL injection prevention (Drizzle ORM)

### 10.2 Polling Safety

- **No Sensitive Data in URL**: Offer ID is UUID (not guessable)
- **Rate Limiting**: Polling respects existing rate limits
- **Timeout**: Prevents resource exhaustion

---

## 11. Accessibility

### 11.1 Loading States

- Use `aria-live="polite"` for status updates
- Provide clear text descriptions of states
- Ensure loading spinners have labels

```typescript
<div role="status" aria-live="polite">
  {status === 'PROCESSING' && (
    <span className="sr-only">Analyzing your offer, please wait...</span>
  )}
</div>
```

---

## 12. Documentation Updates

### 12.1 API Documentation

Update API spec to clarify:
- Async flow is the only supported method
- Polling is required for results
- Expected response times

### 12.2 Code Comments

Add comments explaining:
- Why legacy flow was removed
- How polling works
- Why exponential backoff is used

---

**End of Design Document**
