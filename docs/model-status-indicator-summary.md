# Live Model Status Indicator - Feature Summary

## Overview

A real-time status indicator system that shows the availability, rate limit status, and cooldown timers for AI models in the model selector dropdown. This helps developers avoid selecting rate-limited models and provides transparency into API usage.

---

## Problem Statement

**Current Issues:**
1. Users select a model without knowing if it's rate-limited
2. Upload fails with rate limit error
3. User must manually try different models
4. No visibility into which models are available
5. Wasted time and frustration from trial-and-error

**Impact:**
- Poor developer experience during testing
- Increased failed requests
- Confusion about why uploads fail
- No guidance on which model to use

---

## Proposed Solution

### Visual Concept

```
Model Selector Dropdown:
┌─────────────────────────────────────────────┐
│ 🟢 gemini-2.5-flash                        │
│    Ready • 5/15 requests used              │
├─────────────────────────────────────────────┤
│ 🟡 gemini-2.0-flash                        │
│    Rate limited • Available in 1m 45s      │
├─────────────────────────────────────────────┤
│ 🟢 gemini-flash-lite-latest                │
│    Ready • 2/15 requests used              │
├─────────────────────────────────────────────┤
│ 🔴 gemini-2.5-pro                          │
│    Quota exceeded • Resets in 4h           │
└─────────────────────────────────────────────┘
```

### Status Indicators

**🟢 Available (Green)**
- Model is ready to use
- Shows: "Ready • X/Y requests used"
- Action: Can be selected

**🟡 Rate Limited (Yellow)**
- Temporary rate limit hit
- Shows: "Available in Xm Ys"
- Action: Disabled, countdown timer updates
- Auto-enables when cooldown expires

**🔴 Error/Quota Exceeded (Red)**
- Daily quota exceeded or model error
- Shows: "Resets in Xh" or error message
- Action: Disabled until quota resets

**⚪ Unknown (Gray)**
- Status not yet determined
- Shows: "Status unknown"
- Action: Can be selected (optimistic)

---

## Key Features

### Phase 1: MVP (Essential)

**Backend:**
1. **Model Status Tracking Service**
   - Track API calls per model
   - Record success/failure
   - Detect rate limit errors (429)
   - Calculate cooldown periods
   - Store status in memory/Redis

2. **Status API Endpoint**
   - `GET /api/v1/models/status`
   - Returns status for all models
   - Includes cooldown timers
   - Shows request usage

**Frontend:**
3. **Status Display in Dropdown**
   - Show emoji indicator per model
   - Display status message
   - Disable rate-limited models
   - Poll status every 10 seconds

4. **Basic Error Handling**
   - Graceful degradation if status API fails
   - Show all models as available on error
   - Log issues for debugging

### Phase 2: Enhanced (Nice to Have)

5. **Live Countdown Timer**
   - Real-time countdown for rate-limited models
   - Updates every second
   - Auto-enables model when ready

6. **Request Usage Counter**
   - Show "X/Y requests used this minute"
   - Visual progress indicator
   - Warning when approaching limit

7. **Smart Recommendations**
   - Badge: "⭐ Recommended" on best available model
   - Sort by availability and usage
   - Suggest alternatives when selected model unavailable

8. **Auto-Refresh**
   - Poll status every 10 seconds
   - Update UI without page reload
   - Show "Updated Xs ago" timestamp

### Phase 3: Advanced (Future)

9. **Multi-Instance Support**
   - Redis for shared status across servers
   - Consistent status in load-balanced setup
   - Distributed rate limit tracking

10. **Historical Usage Tracking**
    - Store status history in database
    - Usage patterns over time
    - Cost tracking per model

11. **Auto-Switch on Rate Limit**
    - Automatically switch to available model
    - Retry failed request with backup model
    - Notify user of switch

12. **Performance Metrics**
    - Average response time per model
    - Success rate tracking
    - Error rate monitoring
    - Cost per request (paid tier)

13. **Analytics Dashboard**
    - Usage charts and graphs
    - Peak usage times
    - Model performance comparison
    - Cost optimization insights

---

## Technical Architecture

### Backend Components

```
┌─────────────────────────────────────────────┐
│         ModelStatusService                  │
│  - Track API calls                          │
│  - Detect rate limits                       │
│  - Calculate cooldowns                      │
│  - Store status (Redis/Memory)              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      API Endpoint: /models/status           │
│  - Return all model statuses                │
│  - Include cooldown timers                  │
│  - Show request usage                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Gemini AI Provider                  │
│  - Intercept API calls                      │
│  - Record success/failure                   │
│  - Report to ModelStatusService             │
└─────────────────────────────────────────────┘
```

### Frontend Components

```
┌─────────────────────────────────────────────┐
│           UploadPage Component              │
│  - Fetch model statuses                     │
│  - Poll every 10 seconds                    │
│  - Display in dropdown                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│        Model Selector Dropdown              │
│  - Show status emoji                        │
│  - Display status message                   │
│  - Disable unavailable models               │
│  - Update countdown timers                  │
└─────────────────────────────────────────────┘
```

### Data Flow

```
1. User uploads offer
   ↓
2. Backend calls Gemini API
   ↓
3. ModelStatusService records result
   ↓
4. If 429 error → Mark as rate_limited
   ↓
5. Calculate cooldown (60 seconds)
   ↓
6. Frontend polls /models/status
   ↓
7. Update dropdown UI
   ↓
8. Show countdown timer
   ↓
9. Auto-enable when cooldown expires
```

---

## API Design

### Endpoint: `GET /api/v1/models/status`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "modelName": "gemini-flash-latest",
      "status": "available",
      "requestsUsed": 5,
      "requestsLimit": 15,
      "lastUsed": "2026-02-15T10:30:00Z",
      "cooldownSeconds": 0,
      "quotaResetSeconds": 0,
      "message": "Ready • 5/15 requests used"
    },
    {
      "modelName": "gemini-2.0-flash",
      "status": "rate_limited",
      "requestsUsed": 15,
      "requestsLimit": 15,
      "lastUsed": "2026-02-15T10:31:00Z",
      "cooldownSeconds": 45,
      "quotaResetSeconds": 0,
      "message": "Rate limited • Available in 45s"
    }
  ]
}
```

---

## Database Schema (Optional)

For historical tracking and analytics:

```sql
CREATE TABLE model_status_history (
  id UUID PRIMARY KEY,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL,
  requests_used INTEGER,
  requests_limit INTEGER,
  error_message TEXT,
  cooldown_until TIMESTAMP,
  quota_reset_at TIMESTAMP,
  recorded_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_model_recorded (model_name, recorded_at DESC)
);
```

---

## User Experience

### Before (Current)
1. User selects model blindly
2. Uploads offer
3. Gets rate limit error
4. Tries different model
5. Repeats until success
6. **Time wasted: 2-5 minutes**

### After (With Status Indicator)
1. User sees model statuses
2. Selects available model (green)
3. Uploads offer
4. Success on first try
5. **Time wasted: 0 minutes**

### Edge Cases Handled

**Scenario 1: All Models Rate Limited**
- Show message: "All models temporarily unavailable"
- Display countdown for soonest available
- Suggest waiting or trying later

**Scenario 2: Status API Fails**
- Gracefully degrade to current behavior
- Show all models as available
- Log error for debugging
- Don't block user workflow

**Scenario 3: Model Becomes Available During Selection**
- Auto-update dropdown
- Show notification: "Model X is now available"
- Enable previously disabled option

**Scenario 4: Selected Model Hits Limit During Upload**
- Show error with specific model name
- Suggest available alternatives
- Offer to retry with different model

---

## Benefits

### For Developers
- ✅ Avoid wasted attempts on rate-limited models
- ✅ Clear visibility into API usage
- ✅ Make informed decisions about model selection
- ✅ Reduce frustration from unexpected errors
- ✅ Faster testing and development

### For Users (Production)
- ✅ Faster upload success rate
- ✅ Better experience during high-traffic periods
- ✅ Transparent system status
- ✅ Reduced confusion about failures

### For System
- ✅ Better load distribution across models
- ✅ Reduced failed requests
- ✅ Improved API quota utilization
- ✅ Data for optimization decisions

---

## Implementation Effort

### Phase 1: MVP
- **Time**: 4-6 hours
- **Complexity**: Low-Medium
- **Dependencies**: None
- **Value**: High

**Breakdown:**
- Backend service: 2 hours
- API endpoint: 1 hour
- Frontend integration: 2 hours
- Testing: 1 hour

### Phase 2: Enhanced
- **Time**: 3-4 hours
- **Complexity**: Medium
- **Dependencies**: Phase 1
- **Value**: Medium-High

**Breakdown:**
- Countdown timer: 1 hour
- Usage tracking: 1 hour
- Auto-refresh: 1 hour
- Polish & testing: 1 hour

### Phase 3: Advanced
- **Time**: 8-12 hours
- **Complexity**: High
- **Dependencies**: Phase 1, 2
- **Value**: Medium

**Breakdown:**
- Redis integration: 3 hours
- Historical tracking: 2 hours
- Analytics: 3 hours
- Auto-switch logic: 2 hours
- Testing & refinement: 2 hours

---

## Risks & Mitigation

### Risk 1: Inaccurate Status
**Problem**: Status might not reflect actual API state

**Mitigation:**
- Conservative cooldown estimates
- Periodic health checks
- User can still try "unavailable" models
- Log discrepancies for tuning

### Risk 2: Performance Impact
**Problem**: Frequent polling could slow down UI

**Mitigation:**
- Efficient polling (10s interval)
- Lightweight API response
- Client-side caching
- Debounce updates

### Risk 3: Multi-Instance Inconsistency
**Problem**: Different servers show different status

**Mitigation:**
- Use Redis for shared state (Phase 3)
- Accept eventual consistency
- Show "last updated" timestamp
- Refresh on user action

### Risk 4: False Positives
**Problem**: Marking model as unavailable when it's actually fine

**Mitigation:**
- Allow override (show warning, not block)
- Short cooldown periods (60s)
- Auto-recovery on success
- User feedback mechanism

---

## Success Metrics

### Quantitative
- **Reduced failed uploads**: Target 50% reduction
- **Faster time to success**: Target 2-3 minutes saved per user
- **Lower rate limit errors**: Target 70% reduction
- **Improved model distribution**: More even usage across models

### Qualitative
- **User satisfaction**: Positive feedback on transparency
- **Developer experience**: Easier testing and debugging
- **System reliability**: More predictable behavior
- **Support tickets**: Fewer rate limit complaints

---

## Future Enhancements

### 1. Predictive Status
- Machine learning to predict rate limits
- Proactive warnings before hitting limits
- Smart scheduling of requests

### 2. Cost Optimization
- Show cost per model
- Recommend cheapest available option
- Budget tracking and alerts

### 3. Custom Rate Limits
- Allow users to set their own limits
- Per-user quota tracking
- Team-wide usage monitoring

### 4. Integration with Monitoring
- Connect to Datadog/New Relic
- Real-time alerts on issues
- Automated incident response

### 5. A/B Testing
- Test different models automatically
- Compare performance and cost
- Recommend optimal model per use case

---

## Conclusion

The Live Model Status Indicator is a high-value, medium-effort feature that significantly improves the developer experience. The MVP can be implemented quickly and provides immediate benefits, while the enhanced and advanced phases offer incremental improvements based on user feedback.

**Recommendation**: Proceed with Phase 1 (MVP) implementation to validate the concept and gather user feedback before investing in advanced features.

---

## Next Steps

1. ✅ Create feature summary (this document)
2. ⏭️ Create detailed spec with requirements
3. ⏭️ Design database schema (if needed)
4. ⏭️ Implement Phase 1 (MVP)
5. ⏭️ Test with real rate limit scenarios
6. ⏭️ Gather user feedback
7. ⏭️ Iterate on Phase 2 and 3 based on feedback

---

## Related Documents

- `docs/error-handling.md` - Current error handling implementation
- `docs/api-consumption-analysis.md` - API usage patterns
- `docs/CHANGELOG-rate-limit-ui.md` - Recent rate limit UI improvements
- Future: `.kiro/specs/model-status-indicator/requirements.md`
- Future: `.kiro/specs/model-status-indicator/design.md`
- Future: `.kiro/specs/model-status-indicator/tasks.md`
