# Integration Fixes - Implementation Tasks

## Overview
This task list implements all P0 (blocking) integration fixes identified in the codebase audit. Tasks are ordered by dependency and priority.

**Estimated Total Time**: 10 hours  
**Target Completion**: 2 days

---

## Task 1: Fix API Path Prefix Mismatch

**Priority**: P0  
**Estimated Time**: 30 minutes  
**Dependencies**: None

### Description
Update frontend API client to use correct endpoint paths with `/api/v1` prefix.

### Subtasks
- [ ] 1.1 Update API client baseURL configuration
  - Remove `/api/v1` from baseURL in `frontend/lib/api/client.ts`
  - Change from `http://localhost:3001/api/v1` to `http://localhost:3001`

- [ ] 1.2 Update metadata endpoint paths
  - Update `getRoles()` to call `/api/v1/metadata/roles`
  - Update `getCities()` to call `/api/v1/metadata/cities`
  - Update `getExperienceLevels()` to call `/api/v1/metadata/experience-levels`

- [ ] 1.3 Update offer endpoint paths
  - Update `uploadOffer()` to call `/api/v1/offers`
  - Update `getOffer()` to call `/api/v1/offers/:id`
  - Update `reanalyzeOffer()` to call `/api/v1/offers/:id/analyze`

- [ ] 1.4 Update feature request endpoint paths
  - Update `submitFeatureRequest()` to call `/api/v1/feature-requests`
  - Update `getFeatureRequests()` to call `/api/v1/feature-requests`
  - Update `voteFeatureRequest()` to call `/api/v1/feature-requests/:id/vote`

### Acceptance Criteria
- All API calls use correct full paths with `/api/v1` prefix
- Metadata dropdowns load without errors
- Upload flow works without 404 errors
- Feature requests work without errors

### Testing
```bash
# Manual test in browser console
fetch('http://localhost:3000/api/v1/metadata/roles').then(r => r.json())
```

---

## Task 2: Remove Legacy Synchronous Analyze Flow

**Priority**: P0  
**Estimated Time**: 2 hours  
**Dependencies**: Task 1

### Description
Remove non-existent `POST /analyze` endpoint calls and update upload form to use only async flow.

### Subtasks
- [ ] 2.1 Delete legacy analyze function
  - Remove `analyzeOffer()` function from `frontend/lib/api/endpoints.ts`
  - Remove `AnalyzeRequest` type from `frontend/lib/api/types.ts` (if not used elsewhere)
  - Remove `AnalyzeResponse` type from `frontend/lib/api/types.ts` (if not used elsewhere)

- [ ] 2.2 Update upload form to use async-only flow
  - Open `frontend/components/upload/upload-form.tsx`
  - Remove legacy `analyzeOffer()` call from `handleAnalyze()`
  - Update file upload path to navigate directly to results with offer ID
  - Update paste text path to convert text to file, upload, then navigate to results

- [ ] 2.3 Clean up unused imports
  - Remove any imports related to legacy analyze flow
  - Run linter to catch unused imports

### Acceptance Criteria
- No calls to non-existent `/analyze` endpoint
- Upload form uses only `POST /api/v1/offers` (async)
- File upload redirects to `/results?id={offerId}`
- Paste text upload redirects to `/results?id={offerId}`
- No TypeScript errors
- No console errors during upload

### Testing
- Upload PDF file → verify redirect to results page
- Paste text → verify redirect to results page
- Check network tab for no 404 errors

---

## Task 3: Implement Polling in Results Page

**Priority**: P0  
**Estimated Time**: 2 hours  
**Dependencies**: Task 2

### Description
Add status polling to results page with exponential backoff and proper error states.

### Subtasks
- [ ] 3.1 Add polling state management
  - Add `pollInterval` state (initial: 2000ms)
  - Add `pollCount` state (initial: 0)
  - Add `startTime` state for timeout tracking

- [ ] 3.2 Implement polling logic with useEffect
  - Poll `GET /api/v1/offers/:id` every 2 seconds initially
  - Stop polling when status is COMPLETED
  - Stop polling when status is FAILED
  - Implement exponential backoff: 2s → 4s → 8s → 10s (max)
  - Implement 5-minute timeout

- [ ] 3.3 Add loading states
  - Show "Loading analysis..." when status is QUEUED
  - Show "Analyzing your offer..." when status is PROCESSING
  - Show spinner with progress indicator

- [ ] 3.4 Add error states
  - Show error message when status is FAILED
  - Show "Analysis timed out" after 5 minutes
  - Show "Connection lost" on network error
  - Add retry button for failed/timeout states

- [ ] 3.5 Clean up polling on unmount
  - Clear intervals when component unmounts
  - Clear intervals when polling completes

### Acceptance Criteria
- Polling starts automatically when page loads with offer ID
- Status updates every 2 seconds initially
- Polling interval increases with exponential backoff
- Polling stops when analysis completes
- Loading states show clear messages
- Error states show helpful messages with retry option
- Polling cleans up properly on unmount
- No memory leaks from intervals

### Testing
- Upload offer → verify polling starts
- Mock QUEUED → PROCESSING → COMPLETED flow
- Mock FAILED status → verify error shows
- Wait 5 minutes → verify timeout message
- Disconnect network → verify network error
- Click retry → verify re-upload works

---

## Task 4: Create Backend DTO for Joined Offer + Analysis

**Priority**: P0  
**Estimated Time**: 1.5 hours  
**Dependencies**: None (can run parallel with frontend tasks)

### Description
Create backend DTO that joins offers and analyses tables, returning null analysis when not ready.

### Subtasks
- [ ] 4.1 Create DTO interface
  - Create `backend/src/modules/offer/offer.dto.ts`
  - Define `OfferWithAnalysisDTO` interface
  - Include all offer fields (id, status, isGuest, etc.)
  - Include nested analysis object (nullable)
  - Include failureReason field

- [ ] 4.2 Update OfferService.getById()
  - Add Drizzle query with `with: { analysis: true }`
  - Map database result to DTO structure
  - Handle null analysis case
  - Cast JSONB fields to proper types

- [ ] 4.3 Update route handler
  - Update `GET /api/v1/offers/:id` to return DTO
  - Ensure response matches API spec envelope
  - Add proper error handling

- [ ] 4.4 Add TypeScript types
  - Export DTO interface
  - Ensure type safety throughout service layer

### Acceptance Criteria
- `GET /api/v1/offers/:id` returns joined data
- Analysis field is null when status is not COMPLETED
- Analysis field contains all data when status is COMPLETED
- Response matches DTO interface exactly
- No TypeScript errors
- Proper error handling for missing offers

### Testing
```bash
# Test with curl
curl http://localhost:3001/api/v1/offers/{id}

# Verify response structure matches DTO
```

---

## Task 5: Update Frontend Types to Match Backend DTO

**Priority**: P0  
**Estimated Time**: 1 hour  
**Dependencies**: Task 4

### Description
Update frontend TypeScript interfaces to match backend DTO structure.

### Subtasks
- [ ] 5.1 Update OfferResponse interface
  - Open `frontend/lib/api/types.ts`
  - Replace `OfferResponse` with structure matching backend DTO
  - Add nullable analysis field
  - Remove unused fields (extractedData at root, redFlagsResult, marketComparison)

- [ ] 5.2 Update nested type interfaces
  - Ensure `ExtractedOfferData` matches backend `extractedData` JSONB
  - Ensure `DetectedRedFlag` matches backend `redFlags` JSONB
  - Ensure `SalaryComparison` matches backend `salaryComparison` JSONB
  - Ensure `NegotiationSuggestion` matches backend `negotiationSuggestions` JSONB

- [ ] 5.3 Add null checks in results page
  - Update `results-content.tsx` to check `offer.analysis !== null`
  - Show loading state when analysis is null
  - Map analysis fields correctly when not null

- [ ] 5.4 Run TypeScript compiler
  - Fix any type errors
  - Ensure strict null checks pass

### Acceptance Criteria
- Frontend types exactly match backend DTO
- No TypeScript errors
- Null checks prevent runtime errors
- Results page handles null analysis gracefully
- All analysis data displays correctly when available

### Testing
- Run `npm run type-check` in frontend
- Upload offer → verify types work during polling
- Verify results display when analysis completes

---

## Task 6: Remove Negotiation Feature

**Priority**: P0  
**Estimated Time**: 30 minutes  
**Dependencies**: None

### Description
Remove email-gated negotiation feature since backend endpoint doesn't exist.

### Subtasks
- [ ] 6.1 Remove EmailGatedContent component usage
  - Open `frontend/components/results/results-content.tsx`
  - Remove `EmailGatedContent` import
  - Remove `EmailGatedContent` component from JSX
  - Remove related state/props

- [ ] 6.2 Remove negotiateOffer function
  - Open `frontend/lib/api/endpoints.ts`
  - Delete `negotiateOffer()` function
  - Remove related types if any

- [ ] 6.3 Add comment explaining removal
  - Add comment: "Negotiation feature moved to Phase 2"
  - Update roadmap if needed

### Acceptance Criteria
- No references to `EmailGatedContent` component
- No calls to non-existent `/negotiate` endpoint
- No TypeScript errors
- No console errors
- Results page renders without negotiation section

### Testing
- View results page → verify no negotiation section
- Check network tab for no 404 errors

---

## Task 7: Remove Dead Code

**Priority**: P1  
**Estimated Time**: 1 hour  
**Dependencies**: Tasks 2, 6

### Description
Remove unused functions and clean up imports.

### Subtasks
- [ ] 7.1 Remove extractText function
  - Delete `extractText()` from `frontend/lib/api/endpoints.ts`
  - Remove `TextExtractionResponse` type if defined
  - Remove any imports related to text extraction

- [ ] 7.2 Remove submitCorrections function
  - Delete `submitCorrections()` from `frontend/lib/api/endpoints.ts`
  - Remove related types if any

- [ ] 7.3 Clean up imports
  - Run ESLint to find unused imports
  - Remove unused imports across all modified files

- [ ] 7.4 Remove commented code
  - Search for commented code blocks
  - Remove or uncomment as appropriate

### Acceptance Criteria
- No unused functions remain
- No unused imports
- No commented code blocks
- ESLint passes with no warnings
- Code is clean and maintainable

### Testing
```bash
npm run lint
npm run type-check
```

---

## Task 8: Add Integration Tests

**Priority**: P1  
**Estimated Time**: 3 hours  
**Dependencies**: Tasks 1-7

### Description
Add integration tests for full upload → poll → results flow.

### Subtasks
- [ ] 8.1 Set up test environment
  - Install testing dependencies if needed
  - Configure test database
  - Set up mock API responses

- [ ] 8.2 Write upload flow test
  - Test file upload returns offer ID
  - Test redirect to results page
  - Mock successful upload response

- [ ] 8.3 Write polling flow test
  - Mock QUEUED → PROCESSING → COMPLETED status changes
  - Verify polling intervals
  - Verify polling stops when complete

- [ ] 8.4 Write error handling tests
  - Test FAILED status shows error
  - Test timeout after 5 minutes
  - Test network error handling
  - Test retry functionality

- [ ] 8.5 Write metadata tests
  - Test roles endpoint
  - Test cities endpoint
  - Test experience levels endpoint

- [ ] 8.6 Write feature request tests
  - Test submit feature request
  - Test get feature requests
  - Test vote on feature request

### Acceptance Criteria
- All integration tests pass
- Test coverage > 80% for modified code
- Tests run in CI/CD pipeline
- Tests are maintainable and well-documented

### Testing
```bash
npm run test:integration
```

---

## Task 9: Update Documentation

**Priority**: P2  
**Estimated Time**: 1 hour  
**Dependencies**: Tasks 1-8

### Description
Update documentation to reflect async-only flow and removed features.

### Subtasks
- [ ] 9.1 Update API documentation
  - Document async flow as only supported method
  - Document polling requirements
  - Document expected response times
  - Remove references to legacy `/analyze` endpoint

- [ ] 9.2 Update code comments
  - Add comments explaining polling logic
  - Add comments explaining exponential backoff
  - Add comments explaining why legacy flow was removed

- [ ] 9.3 Update README files
  - Update frontend README with new flow
  - Update backend README if needed
  - Add troubleshooting section

- [ ] 9.4 Update environment variable documentation
  - Create `.env.example` for frontend
  - Create `.env.example` for backend
  - Document all required variables

### Acceptance Criteria
- API documentation is accurate
- Code comments are clear and helpful
- README files are up to date
- Environment variables are documented
- New developers can understand the flow

---

## Definition of Done

For each task to be considered complete, the following must be true:

- [ ] All subtasks completed
- [ ] Code changes committed
- [ ] All TypeScript errors resolved
- [ ] All ESLint warnings resolved
- [ ] Unit tests written and passing (if applicable)
- [ ] Integration tests passing
- [ ] Manual testing completed
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No console errors in browser
- [ ] No network errors in dev tools

---

## Overall Acceptance Criteria

The spec is complete when:

- [ ] User can upload offer and see results end-to-end
- [ ] All metadata endpoints work correctly
- [ ] Feature requests work end-to-end
- [ ] Polling works with proper backoff
- [ ] Error states show helpful messages
- [ ] No dead code remains
- [ ] All tests pass
- [ ] Documentation is complete
- [ ] Code review approved
- [ ] QA sign-off received
- [ ] Deployed to staging and verified
- [ ] Deployed to production and verified

---

## Rollout Schedule

### Day 1 Morning (3 hours)
- Task 1: Fix API paths (30 min)
- Task 2: Remove legacy flow (2 hours)
- Task 6: Remove negotiation (30 min)
- **Deploy to staging**

### Day 1 Afternoon (3 hours)
- Task 3: Implement polling (2 hours)
- Task 4: Create backend DTO (1 hour)
- **Test end-to-end flow on staging**

### Day 2 Morning (3 hours)
- Task 5: Update frontend types (1 hour)
- Task 7: Remove dead code (1 hour)
- Task 8: Add integration tests (1 hour start)

### Day 2 Afternoon (4 hours)
- Task 8: Complete integration tests (2 hours)
- Task 9: Update documentation (1 hour)
- **Full QA testing**
- **Deploy to production**

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Breaking existing features | Comprehensive testing before deploy |
| Type errors after changes | Run TypeScript compiler after each task |
| Polling performance issues | Use exponential backoff, max 10s interval |
| Worker code breaks | Don't change offer/analysis schema |
| User confusion during polling | Show clear status messages |

---

**End of Tasks Document**
