# Integration Fixes - Requirements Document

## 1. Overview

### 1.1 Purpose
Fix critical frontend-backend integration issues preventing OfferLens from functioning end-to-end. This spec addresses all P0 (blocking) issues identified in the codebase audit.

### 1.2 Problem Statement
The OfferLens application cannot complete the core user flow (upload → analyze → view results) due to:
- API endpoint path mismatches
- Missing backend endpoints
- Data contract inconsistencies
- Broken async analysis flow

### 1.3 Goals
- Enable end-to-end offer analysis flow
- Fix all API integration issues
- Align frontend and backend data contracts
- Remove dead code and legacy flows
- Achieve 100% Phase 1 M-level feature completion

### 1.4 Non-Goals
- Performance optimization
- UI/UX improvements
- Phase 2 feature implementation
- Worker code refactoring (separate spec)

---

## 2. User Stories

### 2.1 Core Analysis Flow

**US-1: Upload and Analyze Offer**
> As a **job seeker**  
> I want to **upload my offer letter and see analysis results**  
> So that **I can understand red flags and salary comparison**

**Acceptance Criteria**:
- AC 2.1.1: User can upload PDF/image file
- AC 2.1.2: Upload returns offer ID and QUEUED status
- AC 2.1.3: User is redirected to results page with offer ID
- AC 2.1.4: Results page polls offer status every 2 seconds
- AC 2.1.5: When status is COMPLETED, analysis results display
- AC 2.1.6: When status is FAILED, error message displays with retry option
- AC 2.1.7: All analysis data (score, red flags, salary, suggestions) displays correctly

**US-2: Paste Text Analysis**
> As a **job seeker**  
> I want to **paste my offer text instead of uploading a file**  
> So that **I can analyze offers without scanning/downloading**

**Acceptance Criteria**:
- AC 2.2.1: User can paste text in upload form
- AC 2.2.2: Pasted text is converted to file and uploaded
- AC 2.2.3: Analysis flow works identically to file upload
- AC 2.2.4: User sees same results regardless of input method

### 2.2 Metadata Access

**US-3: Access Metadata Dropdowns**
> As a **job seeker**  
> I want to **select my role, city, and experience from dropdowns**  
> So that **I get accurate salary comparisons**

**Acceptance Criteria**:
- AC 2.3.1: Roles dropdown loads from `/api/v1/metadata/roles`
- AC 2.3.2: Cities dropdown loads from `/api/v1/metadata/cities`
- AC 2.3.3: Experience levels dropdown loads from `/api/v1/metadata/experience-levels`
- AC 2.3.4: All dropdowns show data without errors
- AC 2.3.5: Search/filter works in dropdowns (if implemented)

### 2.3 Feature Requests

**US-4: Submit and Vote on Features**
> As a **user**  
> I want to **submit feature requests and vote on others' requests**  
> So that **the product evolves based on community needs**

**Acceptance Criteria**:
- AC 2.4.1: User can submit feature request with title and description
- AC 2.4.2: User can view list of feature requests
- AC 2.4.3: User can vote on feature requests (one vote per fingerprint)
- AC 2.4.4: Vote count updates immediately after voting
- AC 2.4.5: Duplicate votes are prevented

---

## 3. Technical Requirements

### 3.1 API Integration

**REQ-3.1.1: Fix API Path Prefix**
- Frontend API client must call correct endpoint paths
- All endpoints must include `/api/v1` prefix
- Metadata endpoints must use full path: `/api/v1/metadata/{resource}`

**REQ-3.1.2: Remove Legacy Analyze Endpoint**
- Delete `POST /analyze` call from frontend
- Remove `analyzeOffer()` function
- Remove `AnalyzeRequest` and `AnalyzeResponse` types (if not used elsewhere)

**REQ-3.1.3: Implement Async Flow**
- Upload form must use only async upload endpoint
- Results page must poll offer status until COMPLETED or FAILED
- Polling must use exponential backoff (2s, 4s, 8s, max 10s)
- Polling must stop after 5 minutes with timeout message

### 3.2 Data Contracts

**REQ-3.2.1: Backend DTO**
- Create `OfferWithAnalysisDTO` that joins offers + analyses tables
- `GET /api/v1/offers/:id` must return joined data
- Analysis field must be null when status is not COMPLETED

**REQ-3.2.2: Frontend Types**
- Update `OfferResponse` interface to match backend DTO
- Add null checks for analysis field
- Remove unused type definitions

**REQ-3.2.3: Field Mapping**
- Map `takeHome` from JSONB to number for display
- Map `extractedData` to display fields
- Handle missing/null fields gracefully

### 3.3 Missing Features

**REQ-3.3.1: Remove Negotiation Feature**
- Remove `EmailGatedContent` component from results page
- Remove `negotiateOffer()` function from endpoints
- Update roadmap to move negotiation to Phase 2
- Add comment explaining removal

**REQ-3.3.2: Remove Unused Code**
- Delete `extractText()` function (not used)
- Delete `submitCorrections()` function (endpoint doesn't exist)
- Remove commented code
- Clean up imports

### 3.4 Error Handling

**REQ-3.4.1: Polling Error States**
- Show "Analyzing..." state while PROCESSING
- Show "Analysis failed" with retry button when FAILED
- Show "Analysis timed out" after 5 minutes
- Show network error with auto-retry on connection loss

**REQ-3.4.2: API Error Messages**
- Display user-friendly error messages from backend
- Show retry option for retryable errors
- Log errors to console for debugging

---

## 4. Constraints

### 4.1 Technical Constraints
- Must maintain backward compatibility with existing database schema
- Must not break existing worker code
- Must use existing Axios client with retry logic
- Must maintain type safety throughout

### 4.2 Time Constraints
- P0 fixes must be completed in 2 days
- All changes must be tested before deployment
- No new dependencies allowed

### 4.3 Scope Constraints
- Only fix integration issues, no new features
- No UI/UX changes beyond error states
- No performance optimization
- No worker code changes

---

## 5. Success Criteria

### 5.1 Functional Success
- ✅ User can upload offer and see results
- ✅ All metadata endpoints work
- ✅ Feature requests work end-to-end
- ✅ No console errors during normal flow
- ✅ Error states show helpful messages

### 5.2 Technical Success
- ✅ All API calls use correct paths
- ✅ Frontend types match backend responses
- ✅ No dead code remains
- ✅ Polling works with proper backoff
- ✅ Integration tests pass

### 5.3 Quality Success
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ All tests pass
- ✅ Code review approved
- ✅ QA sign-off

---

## 6. Out of Scope

- Worker code review and fixes
- Performance optimization
- UI/UX improvements
- Phase 2 features
- Database schema changes
- Rate limiting logic changes
- Authentication implementation
- PDF report generation
- Salary crowdsourcing
- Career path insights
- Forum backend implementation

---

## 7. Dependencies

### 7.1 Internal Dependencies
- Existing database schema must remain unchanged
- Worker code must continue to function
- Existing API error handling must work

### 7.2 External Dependencies
- None (all fixes are internal)

---

## 8. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Breaking worker code | High | Low | Don't change offer/analysis schema |
| Breaking existing features | High | Medium | Comprehensive testing before deploy |
| Type errors after changes | Medium | Medium | Run TypeScript compiler after each change |
| Polling performance issues | Low | Low | Use exponential backoff, max 10s interval |
| User confusion during polling | Medium | Medium | Show clear status messages |

---

## 9. Testing Requirements

### 9.1 Unit Tests
- Test polling logic with mock responses
- Test error handling for each error state
- Test data mapping functions

### 9.2 Integration Tests
- Test full upload → poll → results flow
- Test metadata endpoint calls
- Test feature request CRUD operations
- Test error recovery flows

### 9.3 Manual Testing
- Upload various file types
- Test paste text flow
- Test on slow network (throttling)
- Test error states (disconnect network)
- Test on mobile devices

---

## 10. Acceptance Criteria Summary

### Must Have (P0)
- [ ] API paths fixed, all endpoints work
- [ ] Async flow works end-to-end
- [ ] Data contracts aligned
- [ ] Polling implemented with proper states
- [ ] Dead code removed
- [ ] All tests pass

### Should Have (P1)
- [ ] Error messages are user-friendly
- [ ] Retry logic works correctly
- [ ] Loading states are clear
- [ ] Mobile experience is smooth

### Nice to Have (P2)
- [ ] Polling uses exponential backoff
- [ ] Console logs are clean
- [ ] Code is well-documented

---

## 11. Definition of Done

- [ ] All code changes committed and pushed
- [ ] All TypeScript errors resolved
- [ ] All tests passing
- [ ] Code review completed and approved
- [ ] QA testing completed
- [ ] Documentation updated
- [ ] Deployed to staging and verified
- [ ] Product owner sign-off
- [ ] Deployed to production
- [ ] Post-deployment verification complete
