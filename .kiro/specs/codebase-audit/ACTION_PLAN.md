# OfferLens Integration Fix - Action Plan

**Priority**: P0 (Blocking)  
**Estimated Time**: 10 hours  
**Target Completion**: 2 days

---

## Task 1: Fix API Path Prefix Mismatch

**Priority**: P0  
**Time**: 30 minutes  
**Assignee**: Frontend Developer

### Problem
Frontend calls `/roles` but backend expects `/api/v1/metadata/roles`

### Solution
Update frontend API client to remove `/api/v1` from baseURL

### Steps
1. Open `frontend/lib/api/client.ts`
2. Change baseURL from:
   ```typescript
   baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'
   ```
   To:
   ```typescript
   baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
   ```

3. Open `frontend/lib/api/endpoints.ts`
4. Update all endpoint paths to include `/api/v1` prefix:
   ```typescript
   // Before
   apiClient.get('/roles')
   
   // After
   apiClient.get('/api/v1/metadata/roles')
   ```

5. Test all metadata endpoints:
   - GET /api/v1/metadata/roles
   - GET /api/v1/metadata/cities
   - GET /api/v1/metadata/experience-levels

### Verification
```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev

# Test in browser console
fetch('http://localhost:3000/api/v1/metadata/roles')
  .then(r => r.json())
  .then(console.log)
```

---

## Task 2: Remove Legacy Analyze Flow

**Priority**: P0  
**Time**: 2 hours  
**Assignee**: Frontend Developer

### Problem
Frontend tries to call non-existent `POST /analyze` endpoint

### Solution
Remove legacy synchronous analysis, use only async flow

### Steps

#### 2.1 Remove Legacy Endpoint Call (30 min)
1. Open `frontend/lib/api/endpoints.ts`
2. Delete `analyzeOffer()` function
3. Delete `AnalyzeRequest` and `AnalyzeResponse` types from `types.ts`

#### 2.2 Update Upload Form (1 hour)
1. Open `frontend/components/upload/upload-form.tsx`
2. In `handleAnalyze()`, remove this code:
   ```typescript
   const { analyzeOffer } = await import("@/lib/api/endpoints");
   const legacyResult = await analyzeOffer({ ... });
   ```

3. Replace with async flow:
   ```typescript
   // If file uploaded, just navigate to results with ID
   if (asyncOffer?.id) {
     router.push(`/results?id=${asyncOffer.id}`)
     return
   }
   
   // If pasted text, upload as file first
   const blob = new Blob([pastedText], { type: 'text/plain' })
   const textFile = new File([blob], "offer-text.txt", { type: "text/plain" })
   const result = await uploadOffer(textFile)
   router.push(`/results?id=${result.id}`)
   ```

#### 2.3 Implement Polling in Results Page (30 min)
1. Open `frontend/components/results/results-content.tsx`
2. Add polling logic:
   ```typescript
   useEffect(() => {
     if (!id) return
     
     const pollInterval = setInterval(async () => {
       const offer = await getOffer(id)
       
       if (offer.status === 'COMPLETED') {
         // Fetch analysis
         const analysis = await getAnalysis(id)
         setOffer(analysis, offerDetails)
         clearInterval(pollInterval)
       } else if (offer.status === 'FAILED') {
         setError(offer.failureReason)
         clearInterval(pollInterval)
       }
     }, 2000) // Poll every 2 seconds
     
     return () => clearInterval(pollInterval)
   }, [id])
   ```

### Verification
1. Upload a file
2. Verify redirect to `/results?id=...`
3. Verify polling shows "Analyzing..." state
4. Verify results display when complete

---

## Task 3: Fix Data Contracts

**Priority**: P0  
**Time**: 3 hours  
**Assignee**: Backend + Frontend Developer

### Problem
Frontend expects flat `OfferResponse` with analysis data, but backend stores in separate tables

### Solution
Create backend DTO that joins offers + analyses

### Steps

#### 3.1 Create Backend DTO (1.5 hours)
1. Create `backend/src/modules/offer/offer.dto.ts`:
   ```typescript
   export interface OfferWithAnalysisDTO {
     id: string
     status: OfferStatus
     isGuest: boolean
     expiresAt: string | null
     createdAt: string
     updatedAt: string
     
     // From analyses table (null if not complete)
     analysis: {
       score: number
       scoreLabel: string
       extractedData: any
       redFlags: any[]
       salaryComparison: any
       negotiationSuggestions: any[]
       benefits: any[]
       takeHome: any
       lowConfidence: boolean
     } | null
   }
   ```

2. Update `OfferService.getById()` to join with analyses:
   ```typescript
   async getById(id: string): Promise<OfferWithAnalysisDTO> {
     const offer = await db.query.offers.findFirst({
       where: eq(offers.id, id),
       with: { analysis: true }
     })
     
     if (!offer) return null
     
     return {
       id: offer.id,
       status: offer.status,
       isGuest: offer.isGuest,
       expiresAt: offer.expiresAt,
       createdAt: offer.createdAt,
       updatedAt: offer.updatedAt,
       analysis: offer.analysis ? {
         score: offer.analysis.score,
         scoreLabel: offer.analysis.scoreLabel,
         extractedData: offer.analysis.extractedData,
         redFlags: offer.analysis.redFlags,
         salaryComparison: offer.analysis.salaryComparison,
         negotiationSuggestions: offer.analysis.negotiationSuggestions,
         benefits: offer.analysis.benefits,
         takeHome: offer.analysis.takeHome,
         lowConfidence: offer.analysis.lowConfidence
       } : null
     }
   }
   ```

#### 3.2 Update Frontend Types (1 hour)
1. Open `frontend/lib/api/types.ts`
2. Replace `OfferResponse` with:
   ```typescript
   export interface OfferResponse {
     id: string
     status: OfferStatus
     isGuest: boolean
     expiresAt: string | null
     createdAt: string
     updatedAt: string
     analysis: {
       score: number
       scoreLabel: string
       extractedData: ExtractedOfferData
       redFlags: DetectedRedFlag[]
       salaryComparison: SalaryComparison
       negotiationSuggestions: NegotiationSuggestion[]
       benefits: any[]
       takeHome: any
       lowConfidence: boolean
     } | null
   }
   ```

#### 3.3 Update Results Page (30 min)
1. Update `results-content.tsx` to use new structure:
   ```typescript
   if (offer.analysis) {
     setOffer({
       id: offer.id,
       redFlags: offer.analysis.redFlags,
       salaryComparison: offer.analysis.salaryComparison,
       negotiationSuggestions: offer.analysis.negotiationSuggestions,
       takeHome: offer.analysis.takeHome,
       score: offer.analysis.score
     }, extractDetailsFromAnalysis(offer.analysis))
   }
   ```

### Verification
1. Upload offer
2. Poll until complete
3. Verify all analysis data displays correctly
4. Check browser console for type errors

---

## Task 4: Implement Negotiation Endpoint

**Priority**: P0  
**Time**: 4 hours  
**Assignee**: Backend Developer

### Problem
`POST /offers/:id/negotiate` endpoint doesn't exist

### Solution
Implement endpoint or remove feature from frontend

### Option A: Implement Endpoint (4 hours)

#### Steps
1. Create `backend/src/modules/negotiation/negotiation.service.ts`
2. Implement email sending logic (use Gemini to generate script)
3. Add route to `offer.routes.ts`:
   ```typescript
   fastify.post('/:id/negotiate', {
     handler: async (req, reply) => {
       const { id } = req.params
       const { email } = req.body
       
       // Get offer + analysis
       const offer = await offerService.getById(id)
       if (!offer || !offer.analysis) {
         throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404)
       }
       
       // Generate negotiation script
       const script = await negotiationService.generateScript(offer)
       
       // Send email
       await negotiationService.sendEmail(email, script)
       
       return { success: true, message: 'Negotiation script sent' }
     }
   })
   ```

### Option B: Remove Feature (30 min)

#### Steps
1. Remove `EmailGatedContent` component from results page
2. Remove `negotiateOffer()` from `endpoints.ts`
3. Update roadmap to move negotiation to Phase 2

### Recommendation
**Option B** - Remove feature for now, implement in Phase 2

---

## Testing Checklist

After completing all tasks, verify:

- [ ] Upload PDF file → Status QUEUED
- [ ] Poll status → Status changes to PROCESSING → COMPLETED
- [ ] Results page displays all analysis data
- [ ] Red flags show correctly
- [ ] Salary comparison shows correctly
- [ ] Negotiation suggestions show correctly
- [ ] Metadata dropdowns work (roles, cities, experience)
- [ ] Feature request submission works
- [ ] Feature request voting works
- [ ] Error states show user-friendly messages
- [ ] Rate limiting blocks after 3 uploads (guest)

---

## Rollout Plan

### Day 1 Morning
- Task 1: Fix API paths (30 min)
- Task 2.1: Remove legacy endpoint (30 min)
- **Deploy to staging**

### Day 1 Afternoon
- Task 2.2: Update upload form (1 hour)
- Task 2.3: Implement polling (30 min)
- **Test end-to-end flow**

### Day 2 Morning
- Task 3.1: Create backend DTO (1.5 hours)
- Task 3.2: Update frontend types (1 hour)

### Day 2 Afternoon
- Task 3.3: Update results page (30 min)
- Task 4: Remove negotiation feature (30 min)
- **Full integration testing**
- **Deploy to production**

---

## Success Criteria

✅ User can upload offer and see analysis results  
✅ All metadata endpoints work  
✅ Feature requests work  
✅ No console errors  
✅ All Phase 1 M-level features functional  
✅ Integration tests pass

---

**End of Action Plan**
