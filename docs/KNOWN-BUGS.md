# Known bugs and review status

**This file is the single source of truth for the code-review work on OfferLens.** If you start a
new session, read this first. Keep it updated: when a bug is fixed, move it to the Fixed section
with the commit, and when a panel is reviewed, update the inventory.

Last updated: 2026-10-18 · BEN-1 and COR-1/COR-2/COR-4 fixed this session (uncommitted) · 2026-10-18 bug hunt findings added (FLOW-, AUTH-, MONEY-, SEC-; see section 3, "New findings") · Companion doc:
[SPEC-frontend-contract-fixes.md](SPEC-frontend-contract-fixes.md) (the spec behind the earlier fixed items)

---

## 1. Where things stand

| Item | State |
|---|---|
| Branch | `fix/frontend-backend-contract-drift` (pushed to origin) |
| Commits with the fixes | Contract-drift batch `2e170c5`; this session: Benefits `89e9f6f`, Corrections `4771e5a` (doc commit follows) |
| Pull request | **Not opened.** `gh` is not installed on this machine. Open it at https://github.com/muhammedmueen/offerlens/pull/new/fix/frontend-backend-contract-drift |
| Merged to `main` | No |
| Deployed | No. **Deploy the backend before the frontend** (the dashboard reads new backend fields). Also run COR-1 migration `0009` against real Postgres + regenerate the drizzle snapshot/journal before deploy. |
| This doc | Committed (see doc commit below) |
| Tests at last run | Frontend 177 passing. Backend ~1009 passing, 3 skipped (the Postgres-only quota tests); 5 unrelated suites flake on 5s timeouts under full-suite load but pass in isolation. |

How to run the tests: `npx vitest run` inside `frontend/` and inside `backend/`. Type-check:
`npx tsc --noEmit -p tsconfig.app.json` (frontend) and `npx tsc --noEmit -p .` (backend).

Environment notes that affect verification:
- There is **no Postgres or Docker** on this machine. Everything below that touches the database was
  checked with a recording stand-in for the database, never against a real one.
- Nothing has been tried in a real browser. UI fixes are covered by tests only.
- `backend/src/modules/quota/quota.pg.test.ts` needs a real database and is skipped by default.
- `src/providers/pdf/pdf-text.test.ts` failed once in a full backend run and passed on rerun. It looks flaky under load.

How each finding below was established:
- **Reproduced**: I ran it (a throwaway test or a mock) and saw the wrong behaviour.
- **Code-read**: confirmed by reading the frontend and backend code together, not run.

---

## 2. Fixed (on the branch, not yet merged or deployed)

| ID | Bug | What was done |
|---|---|---|
| B1 | Forum: creating a post or comment failed (frontend sent `body`, backend needs `content`) | Frontend sends `content`. Backend routes now validate with Zod, so a bad request is a 400 not a 500. |
| B2 | Forum: post bodies and comment text blank, authors always "Anonymous" | Frontend reads `content` and `authorName`. |
| B3 | Dashboard stat tiles always 0 / "—" | Tiles read `totalOffers`, `completedAnalyses`, `averageScore`, `bestScore`. "Active Offers" removed (decided). Backend now returns `bestScore`. |
| B4 | Dashboard pager never appeared (read `totalPages`, backend nests it in `pagination`) | Reads `pagination.totalPages`. Changing sort resets to page 1. |
| B5 | Dashboard and Compare showed "—" / "Unknown — Role" | Backend list now returns `company` and `role`. Also no longer sends `rawText` (the full offer letter) per row. |
| B6 | Feature requests: "In progress" filter returned 400 (sent `in progress`, API needs `in_progress`) | Filter sends the enum value. Label stays readable. |
| B7 | Feature request vote counts always 0 (read `votes`, API sends `voteCount`) | Reads `voteCount`. Shows `hasVoted` and disables the button. |
| B8 | Feature requests: invalid submit did nothing, no feedback | Title 5+ and description 20+ characters enforced in the form. Error toasts on submit and vote. `ALREADY_VOTED` handled. |
| B9 | Login: a wrong password reloaded the page, losing the error and `?returnUrl=` | Credential endpoints (login/signup/google/refresh) skip the refresh-and-redirect path. A failed refresh redirects with `returnUrl`. The stuck refresh lock is fixed. Logout deliberately still refreshes. **Superseded by AUTH-5 (`ab07808`):** logout no longer refreshes; it sends the refresh token in its body and the server revokes it. |
| S1 | **Privacy leak**: public `GET`/`POST /feature-requests` returned every submitter's `submittedByFingerprint` and `submittedByIp` | Both endpoints now exclude those fields. Anything already deployed still leaks until this ships. |
| X1 | Forum category was free text | Fixed list `negotiation`, `career`, `advice`, `general`, validated on the backend, dropdown and filter on the frontend. |
| X2 | Dashboard score sort put unanalysed offers first, and paging could repeat or skip rows | `NULLS LAST` plus an offer-id tiebreaker. |

**Fixed this session (2026-10-18), committed on `fix/frontend-backend-contract-drift`, not yet merged/deployed, not reviewed in a browser/real Postgres.** Benefits fixes (BEN-1/2/3/4) in commit `89e9f6f`; Corrections fixes (COR-1/2/4) in commit `4771e5a`; Salary Explorer fix (SAL-1) in commit `3f4bae5`; Career panel fix (CAR-1) in commit `6aa010f`; Negotiation cluster (NEG-1..10) in commits `2b7b3f5` (backend) and `58c2fd9` (frontend); bug-hunt batch 1: FLOW-2 in `84badcd`, FLOW-1 / AUTH-2 in `9f1c64c`; sessions batch (AUTH-3, AUTH-4, AUTH-5, MIN-1) in `ab07808`; results-page batch (MONEY-2, MONEY-6 / SEC-1, MONEY-9, FLOW-3 / SEC-4, MONEY-10 drawer part) in `5811366`; PDF glyphs (SEC-2, SEC-9) in `e1aa00c`; Google login (AUTH-1) in `602bee5`; AUTH-8 in `837b5ea`.

| ID | Bug | What was done |
|---|---|---|
| BEN-1 | Benefits total compensation wrong for CTC-only letters (collapsed to the benefits sum; adding a benefit dropped the total) | With-benefits branch no longer rebuilds the total from `baseSalary + variablePay + benefitsTotal`. New pure helpers `annualizeBase()` (normalizes `baseSalary` by `period`) and exported `computeHeadlineTotal()` = `max(totalCTC, annualizedBase + variablePay)`; benefits surfaced separately, never summed into the headline. Verified by repro: CTC-only ₹12,00,000 + ₹10,000 benefit now shows ₹12,00,000 (was ₹10,000); all-unvalued shows ₹12,00,000 (was ₹0); monthly base annualizes. 7 new unit tests in `benefits.service.test.ts`. `ponytail:` comment names the on-top-of-CTC vs part-of-CTC ceiling. |
| BEN-3 | Any failed benefits request (429/404/500/network) showed "No benefits data found... total comp equals your base CTC" because the query never read its error state; Recalculate had no failure feedback | `BenefitsPanel.tsx` now places an error/retry guard BEFORE the empty-breakdown check, so a failed request shows a real error + retry (429 uses the shared quota/rate-limit helpers and retry predicate per CareerPathPanel). The "no benefits data" copy is preserved verbatim for the legitimate success-but-empty case. A failed Recalculate now surfaces an alert (declarative `recalculate.error` render), without touching the success path (BEN-4 left out of scope). 5 new frontend tests; suite 169 → 174, tsc clean. |
| BEN-4 | "Recalculate with my values" didn't change the headline totals — they reverted (onSuccess `refetch()` of the no-override query clobbered the recalculated result; pie/inputs kept the overrides, totals snapped back) | `BenefitsPanel.tsx` removes the stray `onSuccess: refetch()` and reads every headline/breakdown figure from a single derived `view = recalculate.data ?? data`, so the recalculated result wins and no longer reverts on a settled refetch. BEN-3 error handling untouched. 1 new frontend test (forces every post-recalculate call to the original payload and asserts the original total is gone and stays gone); suite 174 → 175, tsc clean. **Note (resolved by decision):** the backend headline total does not move with benefit overrides. Per the Model A decision below, this is correct — benefits are part of CTC, so overriding a benefit changes the breakdown/pie, not the headline. The BEN-2 work carries the UI note making this explicit. |
| COR-1 | Corrections saved but never applied (Option A chosen: apply them) | Corrections now overlay onto `analyses.extractedData` in one transaction, so every reader (`getAnalysis`, benefits, career, export) picks them up; reopening shows the corrected value. A `totalCTC` correction triggers a targeted deterministic recompute of `takeHome` (exact) and score/percentile (approximate interpolation against the 4 stored market points; unscored salaries early-return so no sub-score is invented), wrapped in `optionalStage` to fail soft. Frontend invalidates `["analysis", offerId]` on a real change and the toast only claims "applied" when the server reports `changed`. New `correctable-fields.ts` allowlist; 28 new backend + 3 new frontend tests. |
| COR-2 | Each correction save cleared the career cache, wasting a daily career credit | Career cache dropped only when a changed field is role/location (`CAREER_RELEVANT_FIELDS`); a `totalCTC`/notice/probation correction leaves it intact. |
| COR-4 | `field` any string, `correctedValue` `z.any()` — table could fill with junk / arbitrary jsonb write | Six-path allowlist in `correctable-fields.ts` validated before any write (rejects non-allowlisted paths incl. prototype pollution), per-field value typing (finite non-negative CTC; string ≤200 chars for text). `correction.schema.ts` `field` tightened to `z.enum` from the shared constant. |
| BEN-2 | Insurance cover treated as money ("Health insurance ₹5 lakh" recorded as an "Annual premium" of 5,00,000 and summed into compensation) — that is the sum assured, not pay | Insurance branch of `benefits.calculator.ts` now returns `monetaryValue: null` / `isQuantifiable: false` with a `"Cover: ₹X"` detail (misleading "Annual premium" label removed), so cover contributes 0 to `benefitsValue` and never enters `computeHeadlineTotal`. Premium-vs-cover not distinguished (data model can't tell them apart) → every insurance figure treated as cover, the safe Model A default, with a `ponytail:` comment. `BenefitsPanel.tsx` gained the Model A note ("Benefits are part of your CTC. Editing them changes the breakdown, not your total."). Backend benefits module 46 pass; frontend 175 → 177; tsc clean. |
| SAL-1 | Salary Explorer fired a request on every keystroke after the first search (query key followed live input; `searched` stayed true), tripping the 30/min limit; 1-char values hit the backend 2-char min and showed the misleading "No data for this combination yet" | `SalaryExplorerPage.tsx` splits draft role/city inputs from committed search terms; the `useQuery` key + `enabled` read only the committed terms, so typing no longer fires requests — search runs on explicit submit only. A client-side `MIN_TERM_LENGTH=2` guard (matching `salary.schema.ts`) disables Search and blocks submit for too-short input, so a 1-char value never reaches the backend and the misleading empty-state no longer shows for in-progress/too-short input. Legitimate empty-state preserved. 3 new call-count-based tests; suite 177 → 180, tsc clean. Committed `3f4bae5`. |
| CAR-1 | Career Path panel retried permanent errors 3× (e.g. 400 "role not identified in offer"), then showed a generic error with a retry button that could never succeed | `CareerPathPanel.tsx` retry predicate no longer retries permanent 4xx; a 400 "role not identified" (and other 4xx) fails immediately with a meaningful message and NO retry button. Transient errors (network/5xx) keep the retry affordance; 429 follows the shared `getQuotaError`/`isRateLimited` convention (matching BenefitsPanel). 4 new tests (call-count + retry-button presence/absence); suite 180 → 184, tsc clean. Committed `6aa010f`. |
| NEG-1, NEG-6 | Failed/garbage AI negotiation scripts were shown and CHARGED as real `personalized` scripts (provider swallowed its error and returned a stub; result never validated for non-empty subject/body) | **Decision:** never leave the user charged for a failed/garbage generation. Quota is **charge-then-release** (verified against `quota.service.ts`: no reserve-pending primitive; the refund path is analysis-only). The provider now THROWS on failure so the service's existing `release()` catch nets the quota back; AI output is validated with `z.object({subject,body}).trim().min(1)`; invalid/failed → template fallback labelled `template`, not charged as `personalized`. Invariant proven by mock call-count (reserve 1/release 0 on validated success, net-zero on every failure/thin path). `base.ai.ts`, `negotiation.service.ts`. Committed `2b7b3f5`. |
| NEG-5, NEG-9 | Template email mislabelled CTC as "Base salary" (reproduced); base-only letters showed an empty "[OFFERED SALARY]" placeholder | Template salary line anchors to base salary when present (via `annualBasicFrom`) and labels the CTC figure as CTC (never "Base salary"); base-only letters use the base figure instead of the empty placeholder. One fix covering CTC-only and base-only. `negotiation.template.ts`. Committed `2b7b3f5`. |
| NEG-8 | `focusAreas` accepted any string, looked up as keys on a plain object → `["constructor"]` injected "function Object() {...}" into the email; duplicates repeated lines | `focusAreas` is a `z.enum` of the panel's exact values with dedupe at the HTTP boundary; template lookup uses `Object.create(null)` + `Object.hasOwn`, so prototype keys can't leak. `negotiation.schema.ts`, `negotiation.template.ts`. Committed `2b7b3f5`. |
| NEG-10, NEG-7 | Panel typed `script` as `any` (a non-string field could crash into the error boundary; raw JSON shown on drift); a stale script stayed visible under the error alert and could be copied | Backend exports a discriminated `NegotiationScript` type (always-string subject/body), mirrored types-only into `frontend/src/types/api.ts`; the panel adopts it (no `any`, no `JSON.stringify` fallback). The script is cleared on a new submit and on error, so a stale email can't be copied. `base.ai.ts`, `negotiation.service.ts`, `api.ts`, `NegotiationPanel.tsx`. Committed `2b7b3f5` (backend/type) + `58c2fd9` (panel). |
| NEG-2 | Closing the drawer lost the generated script; reopening forced a regenerate that spent another of the 10 daily credits | The script persists in the react-query cache keyed by `offerId+tone+focusAreas`, so closing and reopening the drawer rehydrates it with zero new POSTs (no extra credit). Per-session ceiling noted with a `ponytail:` comment. Proven by a no-new-POST call-count test. `NegotiationPanel.tsx`. Committed `58c2fd9`. |
| NEG-3 | "Generate Negotiation Email" only appeared when negotiation tips existed, though the backend has a template path for the thin-data case | The generate button moved out of the tips gate, so thin-data offers can still get the backend template email. `ResultsPage.tsx`. Committed `58c2fd9`. |
| NEG-4 | Copy copied body but not subject; showed "Copied!" even when the clipboard write failed; 429 showed the generic error; unused `Download` import | Copy puts both subject and body on the clipboard; the write is awaited and only shows "Copied!" on success (destructive toast on failure); a 429 shows the rate-limit text via `isRateLimited`/`RATE_LIMITED_TEXT`; unused import removed. `NegotiationPanel.tsx`. Committed `58c2fd9`. Negotiation: 41 new tests across both passes; backend 1024 pass/3 skip, frontend 193 pass. |
| FLOW-2 | Workers wrote `FAILED` on every failed attempt, so the processing page showed "Analysis Failed" while the BullMQ retry then completed | Both workers write `FAILED` only on the final attempt (via `failOfferAndRefund`, refund exactly-once unchanged); earlier attempts write nothing and rethrow, so the offer stays `PROCESSING`. The analysis worker sets `PROCESSING` and clears `failureReason` at the start of every attempt. A re-upload during a retry now dedups instead of deleting the running offer. **Ceiling (ponytail on `STUCK_OFFER_TIMEOUT_MS`):** worst-case retry chains (three slow Azure OCR polls, or AI calls with no enforced per-call budget) can outrun the 5-minute reaper, which then fails the offer while a retry still runs; upgrade path is a per-attempt budget or a heartbeat column. 8 DB-free worker tests drive the real processors; backend 1038 pass / 3 skip. Committed `84badcd`. |
| FLOW-1 / AUTH-2 | An expired access token on guest-capable routes silently became a guest: uploads turned into 24h guest offers never on the dashboard; open results tabs became an unrecoverable 404 | The global `authenticate` hook returns 401 `TOKEN_EXPIRED` for any request carrying a Bearer that fails verification, so the existing interceptor refreshes and retries; no Bearer still means a true guest (ADR-001). The body-authenticated `/auth/*` routes are exempt by matched route pattern, so a stale header cannot block login. On a failed or impossible refresh the frontend clears the session and fires `auth:session-ended` so the UI flips to logged out; member pages (`/dashboard`, `/compare`) redirect to login with `returnUrl` (B9 kept), other pages retry once as a true guest, after the UI has flipped (never a silent guest upload). **Known interactions, not yet fixed:** a transient refresh failure still ends a valid session (AUTH-3), which on `/upload` now yields a visible guest upload that email login can't claim (MIN-6); a logout in another tab still leaves this tab showing signed in (AUTH-4 area). 14 backend inject + 7 frontend tests; backend 1052 pass / 3 skip, frontend 200 pass. Committed `9f1c64c`. The two interactions are closed by the sessions batch (`ab07808`, next row). |
| AUTH-3, AUTH-4, AUTH-5, MIN-1 | Transient errors (network, 5xx, 429) ended valid sessions and, after FLOW-1, could turn an upload into a guest offer; two tabs refreshing at once logged out every tab; logout sent no body so the refresh token was never revoked; logout didn't clear cached queries, so the next user on the tab could see the previous user's data | **AUTH-3:** a session ends only when the server rejects it (`/auth/refresh` or `/users/me` answering a 4xx other than 408/429, or no refresh token). Network/5xx/408/429 keep both tokens, skip the guest retry and redirect, and fail only the request and those queued behind it. Boot failures leave auth "unknown" and retry `/users/me` every 5 s. **AUTH-4:** refreshes run under a Web Locks mutex with "another tab already refreshed/rotated" re-reads; the backend claims the refresh row with one atomic `DELETE … RETURNING`; a `storage` listener ends this tab's session when another tab logs out or clears storage; the refresh success path stores the new pair only if storage still holds the token it sent, otherwise it drops and revokes the new token, so a logout can't be undone by another tab's refresh. **AUTH-5:** logout sends `{ refreshToken }` with no Bearer and does not refresh first; local state clears even if the call fails. **MIN-1:** every session end removes cached queries. **Ceiling (ponytail on `withTabLock`):** without `navigator.locks` (non-secure origins, pre-2022 browsers) a fast-losing tab can still end the winner's session; production HTTPS has Web Locks. Also adds the stale-token 401 tests for the five guest-capable route groups FLOW-1 left untested. Backend 1065 pass / 3 skip, frontend 223 pass. Committed `ab07808`. |
| MONEY-2, MONEY-6 / SEC-1, MONEY-9, FLOW-3 / SEC-4, MONEY-10 (drawer part) | "50th percentile" over four ₹0 bars on offers with no benchmark; corrected percentile clamped to 25-90 and unrounded ("58.333325th"), and a down-correction could raise the score (regression from COR-1); "1th / 22th" ordinals; dashboard rows for unfinished/failed offers opened "Something went wrong", rows not keyboard-accessible, guests sent to a login wall; Benefits drawer showed "₹0" for an unknown total | **MONEY-2:** the AI-estimated path keeps a null percentile and null p-values null end to end (parser, worker, market-data, benchmark comparison, rubric, PDF); the results page hides the salary comparison when there is no usable range, including legacy rows stored with a baked-in 50 and all-zero range. **MONEY-6 / SEC-1:** `reRankPercentile` returns a rounded integer in [0, 99], extrapolates below p25 toward 0 and above p90 along the p75-p90 slope instead of clamping, and anchors on the worker's own (CTC, rank) point, persisted once as `salaryComparison.rankAnchor` so chained corrections don't drift; a down-correction can never raise the rank (8L at the 10th → 7L stays ≤ 10th; 8L→9L→8L returns to the 10th); a malformed persisted anchor is ignored. **MONEY-9:** `Intl.PluralRules` ordinal helpers in backend and frontend. **FLOW-3 / SEC-4:** dashboard rows route by status (COMPLETED → results; QUEUED/PROCESSING/FAILED → processing page with progress and failure reason) through a real keyboard-accessible link; the give-up screen no longer sends guests to the dashboard; the results page shows a not-ready state with a link to processing on 404. **MONEY-10 (drawer only):** "—" for an unknown total, and the no-benefits branch uses `computeHeadlineTotal` / `annualizeBase`. The cross-surface part (PDF, Compare, salary bar) is still the open MONEY-10/SEC-8 decision. Backend 1116 pass / 3 skip, frontend 254 pass. Committed `5811366`. |
| SEC-2, SEC-9 / MONEY-11 | The PDF printed junk for 💡, → and ₹ (built-in Helvetica is WinAnsi-only); money used the server locale ("1,200,000"); PDF score colours differed from the gauge | The report embeds DejaVu Sans regular + bold (free licence, `backend/assets/fonts/LICENSE-DejaVu.txt`, about 1.4 MB). The build copies `assets/` into `dist/`, so the fonts ship in the Docker image. The emoji is replaced by a "Tip:" label, and AI text is sanitised to strip pictographs the font can't draw. INR uses en-IN grouping, and PDF colour bands match `ScoreGauge`. Content-stream tests assert the embedded font, no junk glyphs, no emoji, en-IN grouping and the colour band. Committed `e1aa00c`. |
| AUTH-1 | Google login trusted any Google access token userinfo accepted, including tokens issued to other apps (account takeover); no `email_verified` or `sub` check before login/linking | The access token is checked with Google's tokeninfo (`google-auth-library`, already a dependency): `aud` must equal `GOOGLE_CLIENT_ID`, it must be unexpired and carry the email scope, and identity comes from that response. Both token branches require `email_verified`, look users up by `googleId` first, and refuse an email already linked to a different `googleId`. Every rejection is one generic 401; the reason is logged without the token. **Before deploy:** verified only against a mocked Google. Test one real Google login, confirm `GOOGLE_CLIENT_ID` equals the frontend's `VITE_GOOGLE_CLIENT_ID`, and confirm a token minted for another client (e.g. OAuth Playground) gets 401. A mismatch would block every Google login. Remaining gap: AUTH-8. Committed `602bee5`. |
| AUTH-8 | Pre-account hijacking: an attacker who registered a victim's email with a password kept access after the victim linked Google | Decision (a): when a verified Google identity links to an account whose email was never verified, one transaction sets `googleId`, marks the email verified, removes the password and deletes every refresh token for that user. Already-verified accounts link as before. Password login with no password is the same generic 401 as a wrong password. **Ceiling:** existing 15-minute access tokens stay valid until expiry (no renewal). Note: no password account is ever verified today, so any password user who signs in with Google loses their password and uses Google from then on. Committed `837b5ea`. |

**Deploy caveat for COR-1:** migration `backend/drizzle/0009_corrections_unique_field.sql` (unique index on `(offerId, field)` + dedupe + upsert) was hand-authored with no live Postgres. Before deploy it must run against real Postgres (it dedupes existing rows **before** creating the unique index — order matters), and `drizzle/meta/0009_snapshot.json` + the `_journal.json` entry must be regenerated via `drizzle-kit generate` on the DB machine.

Also added with these fixes: typed response interfaces in `frontend/src/types/api.ts`, page tests
for each fixed screen, and `backend/src/response-contract.test.ts` which fails if a field the
frontend reads is renamed or if the submitter fields reappear.

---

## 3. Open bugs

Severity: **Major** = wrong money or data shown to users, or silent data loss. **Medium** = clearly
broken behaviour with a workaround. **Minor** = polish or edge cases.

### Benefits panel (worst panel: the numbers cannot be trusted)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| BEN-2 | Major | Insurance cover is treated as money. "Health insurance ₹5 lakh" is extracted as an "Annual premium" of 5,00,000 and added to compensation. That is the sum assured, not pay. | `backend/src/modules/benefits/benefits.calculator.ts` (insurance branch, "Annual premium") | Code-read |
| BEN-5 | Minor | Rows keyed by `b.name` collide when two benefits share a name (shared override, duplicate-key warning). Negative overrides accepted. Clearing an input turns into 0. Benefit categories matched by substring (for example "Health club" treated as insurance). | `BenefitsPanel.tsx`, `benefits.calculator.ts` | Code-read |

### Negotiation panel

_All of NEG-1 through NEG-10 fixed this session (two passes: backend then frontend) — see section 2._

Negotiation review note: the `/code-review` pass on this panel also suggested refreshing the quota
snapshot after a successful generation. Rejected: nothing in the UI reads the negotiation or career
quota counts, so it has no visible effect.

### Career panel (healthiest)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| CAR-2 | Minor | Two simultaneous opens that both miss the cache both call the AI and both charge a credit (no lock). | `backend/src/modules/career/career.service.ts` | Code-read |

_CAR-1 fixed this session — see section 2._

### Corrections panel (looks like it works, changes nothing)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| COR-3 | Medium | No rate limit. `RATE_LIMITS.corrections` (20/hour) exists but its own comment says it is not wired. Only the global 100/min applies, and each request can insert 20 rows. | `backend/src/config/constants.ts`, `correction.routes.ts` | Code-read |

### Salary Explorer

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
_SAL-1 fixed this session — see section 2._

### Other minor items from the first review

| ID | Bug | Where |
|---|---|---|
| MIN-1 | **Fixed** in `ab07808` (sessions batch), see section 2. Was: logout does not clear the query cache. Dashboard queries are not keyed by user, so a second user on the same tab can briefly see the previous user's offers and scores. | `frontend/src/store/auth.tsx`, `pages/DashboardPage.tsx` |
| MIN-2 | Debug `console.log` ships in production builds and logs offer text and extraction responses (also the FormData log in the API client). | `pages/UploadPage.tsx`, `lib/pdf-extractor.ts`, `services/api.ts` |
| MIN-3 | If a second file's extraction fails, the first file's extracted text can still be submitted under the new file's name. | `pages/UploadPage.tsx` (`handleExtractAndAnalyze`) |
| MIN-4 | The file picker's `accept` omits `.txt`, though the backend accepts `text/plain`. | `pages/UploadPage.tsx` |
| MIN-5 | The failed-analysis screen tells users to "switch to a different model"/"use the model selector", but the selector exists only in dev builds. The backend failure strings say the same. | `pages/ProcessingPage.tsx`, `backend/src/workers/analysis.worker.ts` |
| MIN-6 | Guest analyses are claimed on signup and Google login but not on email login. May lose a guest analysis when the 24-hour guest expiry hits. **Needs a product answer**: intentional or not. | `frontend/src/store/auth.tsx`, `backend/src/modules/auth/auth.routes.ts` |
| MIN-7 | PDF download swallows errors; Share gives no confirmation. | `pages/ResultsPage.tsx` |
| MIN-8 | Signup in the auth popup shows a generic error even when the email already exists. | `components/common/AuthGateModal.tsx` |
| MIN-9 | Old forum posts with a free-text category display but cannot be filtered. A migration to `general` would be a separate ticket. | database data |
| MIN-10 | Feature requests page has no pagination; the backend's `meta` totals are unused. | `pages/FeatureRequestsPage.tsx` |
| MIN-11 | `GET /users/me/offers` `page` and `limit` are not validated (garbage becomes NaN). | `backend/src/modules/user/user.routes.ts` |
| MIN-12 | `Confidence` component is defined inside `ResultsPage`'s render, so it remounts every render. | `pages/ResultsPage.tsx` |

### Decisions already made (do not re-litigate)
- Backend and `docs/api-spec.md` are the source of truth; the frontend adapts.
- Drop "Active Offers" from the dashboard.
- Score sort puts unanalysed offers last.
- Forum categories are a fixed list.
- Logout revokes the server-side refresh token. **Changed by AUTH-5 (`ab07808`):** logout no longer goes through the refresh flow (refreshing first would rotate away the token it is about to revoke). It reads the refresh token, clears local state, and sends `POST /auth/logout { refreshToken }` with no Bearer; the backend exempts logout from the stale-token rejection.
- COR-1: apply corrections to the analysis (Option A), not relabel as feedback. Done this session: targeted deterministic recompute (overlay corrected fields onto `extractedData`; recompute take-home exactly and score/percentile approximately on a `totalCTC` change; do not fake a role/location re-benchmark).
- Benefits model (Model A): benefits are **part of** the CTC, not on top of it. The headline "Total compensation" is always the CTC (`max(totalCTC, annualizedBase + variablePay)` per BEN-1) and never moves when a benefit value is overridden — Recalculate changes the breakdown/pie only. No "on-top-of-CTC" benefit flag is added (Model B rejected). Drives BEN-2: insurance cover (sum assured) is coverage, not money, and no benefit adds to the headline total.

### Decisions still needed
- **Decided (a), fixed.** Follow-up worth doing: add email verification to password signup (option c). AUTH-8: when Google is linked to a password account whose email was never verified, should we (a) link, revoke that account's sessions and remove its password (the Google owner keeps the account; anyone who knew the password loses it), (b) refuse the link and ask the user to sign in with their password, or (c) add email verification to password signup first? Note: today no password account is ever verified, so (a) and (b) affect every password user who tries Google.
- MIN-6: should email login claim guest offers like signup does?
- SEC-3: what should Share mean? Build a real read-only shared link (signed, revocable), or relabel the button ("only you can open it") or remove it?
- MONEY-1: move variable pay out of the monthly take-home and show it separately as "plus up to ₹X/yr"?
- MONEY-10 / SEC-8: should every money surface use `computeHeadlineTotal`, so the Benefits drawer, PDF, Compare and salary bar agree?
- FLOW-4: when the same letter is resubmitted with a different role/city/experience, re-analyse it, or tell the user it was already analysed?
- SEC-10: build the data-export and account-delete UI now?

### New findings: bug hunt 2026-10-18

Four read-only investigations of the branch: core flow (upload to results), money figures on the
results page, auth/sessions/quota, and secondary screens. No source was changed by the hunts.
Nothing here was verified in a real browser or against real Postgres. **Reproduced** means the
behaviour was driven through the real code with mocks (throwaway tests, since deleted);
**Code-read** means it was not run. Duplicates found by more than one hunt are merged onto one row
with both IDs; the other table has a pointer row. Items tagged **[visible]** are the ones most
likely to make a user think the product is broken. Source reports: `.agents/tasks/hunt-core-flow.md`,
`hunt-auth-quota.md`, `hunt-money-figures.md`, `hunt-secondary-screens.md`.

**Fixed so far:** FLOW-2 (`84badcd`) and FLOW-1 / AUTH-2 (`9f1c64c`), batch 1 — see section 2. Their rows stay below for reference.

#### Core flow (upload, extraction, worker, processing, results)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| FLOW-1 / AUTH-2 | Major | **[visible]** Once the 15-minute access token expires, routes that also serve guests treat a signed-in user as a guest instead of returning 401, so the frontend never refreshes. An upload is saved as a 24-hour guest offer that never appears on the dashboard and is then deleted; it is charged to the browser's guest allowance (a signed-in user can get the guest 429 copy); drawer features return 404 on it. A results tab left open past 15 minutes turns into "Something went wrong" on refetch. **Fixed** in batch 1, see section 2. | `backend/src/middleware/authenticate.ts:22-43` (only sets `tokenInvalid`); `offer.routes.ts:111`, `offer.service.ts:55,137,145`; `quota.routes.ts:21`; `analysis.routes.ts:17,43`; `offer-guard.ts:28-36`; `user.service.ts:74`; `cleanup.worker.ts:70` | Reproduced (backend: Fastify inject with the real `authenticate`, offer, quota and analysis routes, DB mocked). Frontend effect code-read. |
| FLOW-2 | Major | **[visible]** When attempt 1 of 3 fails, the worker writes `FAILED` and never sets the offer back to `PROCESSING` for the retry. The processing page stops polling and shows "Analysis Failed" while the retry often succeeds. A guest who presses Try Again can hit the daily 429, because the slot is refunded only on the final attempt. **Fixed** in batch 1, see section 2. | `backend/src/workers/analysis.worker.ts:463-467`, `ocr.worker.ts:177-181`, `queues.ts` (`attempts: 3`); `frontend/src/pages/ProcessingPage.tsx:41,95` | Reproduced (backend: real worker, BullMQ/DB/AI mocked; attempt 1 wrote FAILED, attempt 2 wrote COMPLETED). Frontend behaviour pinned by the existing test "stops on FAILED and shows the failure UI". |
| FLOW-3 / SEC-4 | Medium | **[visible]** **Fixed** in `5811366`, see section 2. Dashboard rows always open the results page. For a QUEUED/PROCESSING/FAILED offer the analysis is 404, so the user sees "Something went wrong" instead of progress or the failure reason. The processing page's give-up screen sends users to the dashboard, which is a login wall for guests. Rows are `<tr onClick>` with no link, tabindex or key handler, so keyboard users cannot open any past offer. | `frontend/src/pages/DashboardPage.tsx:110`; `ResultsPage.tsx:76`; `ProcessingPage.tsx:236,246`; `App.tsx:79`; `backend/src/modules/analysis/analysis.routes.ts:21-27` | Code-read |
| FLOW-4 | Medium | Resubmitting the same letter with a different role/city/experience/current CTC silently returns the old analysis. Dedup hashes only the text. Needs a decision (see above). | `backend/src/modules/offer/offer.service.ts:65,94`; benchmark lookup in `analysis.worker.ts` | Code-read; behaviour pinned by the existing unit test "a non-FAILED duplicate returns early without reserving" |
| FLOW-5 | Minor | Minimum text lengths disagree (paste >20, OCR result ≥50, browser PDF ≥100, worker ≥80 chars). A 21-79 character paste is accepted, queued, then fails with a "that file / photo" message. Quota is refunded. | `UploadPage.tsx:163,304`; `lib/pdf-extractor.ts:28`; `backend/src/workers/ocr.worker.ts:122`; `MIN_EXTRACTED_TEXT_CHARS` in `constants.ts` | Code-read |
| FLOW-6 | Minor | `POST /offers/extract-file` sends PDFs straight to OCR and skips the backend PDF text-layer reader. When pdf.js fails in the browser, a normal PDF fails (Google Vision), gets `OCR_UNAVAILABLE` (mock provider), or is billed per page (Azure). | `lib/pdf-extractor.ts:99`; `UploadPage.tsx:158`; `offer.service.ts:302` (`extractTextFromFile`) | Code-read |
| FLOW-7 | Minor | If autofill fails after text extraction succeeded, the page says "Extraction failed — try pasting the text manually" though the form is shown and can be submitted. Other upload errors all say "check your connection" and drop the server message (e.g. 503 queue unavailable, 400). | `UploadPage.tsx:113,259,261` | Code-read |
| FLOW-8 | Minor | Autofill asks the model for "Current CTC" from an offer letter, so "Current CTC (optional)" is likely pre-filled with the offered CTC and passed to the analysis prompt. | `backend/src/providers/ai/base.ai.ts:488`; `UploadPage.tsx:221`; `analysis.prompt.ts` | Code-read (model output not observed) |

#### Auth, sessions and quota

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| AUTH-1 | Major (security) | **Fixed** in `602bee5`, see section 2 (needs one real Google login test before deploy). Google login checks the access token only through the userinfo endpoint, with no audience check, so a token issued to any other app can be replayed to log in as its owner (account takeover). It also links Google to an existing password account without checking `email_verified`, and does not compare `sub` with a stored `googleId`. | `backend/src/modules/auth/auth.service.ts:76-99` (access-token branch), `:112-128` (linking); `frontend/src/pages/LoginPage.tsx:27`, `SignupPage.tsx:26` (implicit flow) | Code-read (no Google credentials here) |
| AUTH-2 | Major | See FLOW-1 (same root cause, merged there). | — | — |
| AUTH-3 | Medium | **[visible]** Any transient error (500, 429, network) on app boot or during a token refresh deletes both tokens and logs the user out. Since the FLOW-1 fix (`9f1c64c`), a transient refresh failure on `/upload` also re-sends the upload as a guest (visible, but email login can't claim it, MIN-6), so fix this next. **Fixed** in `ab07808`, see section 2. | `frontend/src/store/auth.tsx:38-44` (`fetchUser` catch); `services/api.ts:121-124` (refresh catch → `redirectToLogin`) | Reproduced (frontend vitest with the real `api` and `AuthProvider`) |
| AUTH-4 | Medium | **[visible]** With two tabs open, both refresh with the same refresh token. The losing tab's 401 clears the session, deleting the new tokens the other tab just stored, so every tab is logged out. Backend rotation is find-then-delete, not atomic. Same symptom as AUTH-3. **Fixed** in `ab07808`, see section 2. | `frontend/src/services/api.ts:9,98`; `backend/src/modules/auth/auth.service.ts:142-155` | Reproduced (simulated) |
| AUTH-5 | Medium (security) | Logout sends no body, the backend rejects it with 400 before `authService.logout` runs, and the error is swallowed. The refresh token stays valid for 7 days after logout. Contradicts a recorded decision (see above). **Fixed** in `ab07808`, see section 2. | `frontend/src/store/auth.tsx:81-82`; `backend/src/modules/auth/auth.routes.ts:100-102`, `auth.schema.ts:39-42` | Reproduced (inject against the real `authRoutes`) |
| AUTH-6 | Medium | The guest cap (1 analysis/day) is per cookie. Dropping the cookie gives a fresh allowance, and `POST /offers` has no route limit, only the global 100/min per IP. Each guest analysis is a paid AI call. | `backend/src/middleware/guest-identifier.ts:86`; `offer.service.ts:54`; `offer.routes.ts:22` | Code-read |
| AUTH-7 | Minor | The error handler turns Fastify's own 4xx errors (empty or malformed JSON 400, 415, 413) into 500 `INTERNAL_ERROR`. | `backend/src/middleware/error-handler.ts:96-106` | Reproduced (`POST /auth/logout` with JSON content type and no body → 500) |
| AUTH-8 | Medium (security) | **Fixed** (decision a), see section 2. Account pre-hijacking. Password signup never verifies email (`isEmailVerified` defaults to false and nothing sets it true). An attacker can sign up with a victim's address before the victim joins; when the victim later uses "Sign in with Google", Google is linked into the attacker's account, and the attacker's password still opens it while the victim fills it with offer letters and salary data. Predates AUTH-1 (found by the AUTH-1 security review). The AUTH-1 code comment claiming linking is safe is wrong. Needs a decision (see above). | `backend/src/modules/auth/auth.service.ts` (link branch, comment ~196-198); `signup` | Code-read |

#### Money figures (results page)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| MONEY-1 | Major | Take-home is CTC minus tax minus employee PF, divided by 12. Employer PF, gratuity and variable pay are never removed, so "per month" is overstated by about 6-10% (₹94,000-₹97,000 shown vs about ₹85,600-₹91,600 for ₹12L CTC with ₹6L basic). The "Gross (annual)" tile shows the CTC. Compare uses the most optimistic bound. Needs a decision on variable pay (see above). | `backend/src/modules/takehome/takehome.calculator.ts:216,261-262`; `ResultsPage.tsx:369`; `comparison.service.ts:72` | Reproduced |
| MONEY-2 | Major | **[visible]** **Fixed** in `5811366`, see section 2. On the AI-estimated benchmark path (the common case), a null percentile becomes 50 and null p-values become 0. The page says "Your offer is at the 50th percentile" over four ₹0 bars, even for a letter with no CTC. | `backend/src/modules/analysis/analysis.zod.ts:136-141`; `analysis.worker.ts:126-127`; `ResultsPage.tsx:206,220-221` | Reproduced (real `ResultsPage` rendered with the parser's output) |
| MONEY-3 | Major | `extractMoney` takes the first number and a magnitude word from anywhere in the text: "2,000 RSUs worth $40k" → ₹20,00,000, "12% of basic" → ₹12, "₹2,200 per month" → ₹2,200 a year. These feed "Benefits value" and the pie, and can add up to more than the CTC. Detail strings print unformatted numbers. Separate from BEN-5. | `backend/src/modules/benefits/benefits.calculator.ts:198-211` (also `:109,130`); `BenefitsPanel.tsx:93` | Reproduced (`calculateBenefitValues`) |
| MONEY-4 | Major | The benefits checklist matches short keywords as substrings: "Laptop" counts as paid leave (`pto`), "upfront" as PF, "residence" as health (`esi`), "provision" as health (`vision`), term life as health. A bare letter loses its high-severity "Standard benefits are missing" flag (the model's own flag is suppressed too) and gets a higher Benefits score. | `backend/src/modules/benefits/benefits.checklist.ts:50,58-59,68,143`; `suppress: ['missing_benefit']` in `analysis.worker.ts` | Reproduced (`checkBenefits`) |
| MONEY-5 | Medium | A CTC-only letter shows take-home as one exact figure: `isExact` is true because both PF bounds are 0, so the range and the PF note are hidden. The Employee PF tile shows only the lower PF bound when there is a range. | `takehome.calculator.ts:273`; `ResultsPage.tsx:373` | Reproduced |
| MONEY-6 / SEC-1 | Major | **Fixed** in `5811366`, see section 2. Regression from COR-1, commit `4771e5a`. A totalCTC correction re-ranks the percentile by interpolating the 4 stored points, clamped to 25-90 and not rounded. Correcting a below-market CTC down can raise the salary sub-score and overall score (10th → 25th); ₹2 Cr is capped at 90. The results page, score breakdown, Compare and PDF show values like "41.666666666666664th percentile". | `backend/src/modules/correction/correction.service.ts:209-216`; `score.rubric.ts:174`; `ResultsPage.tsx:221` | Reproduced (both hunts, same mocks as `correction.service.test.ts`) |
| MONEY-7 | Medium | No surcharge marginal relief. ₹100 more than a ₹50,75,000 CTC raises tax by ₹1,12,354; the same cliff exists at ₹1 Cr and ₹2 Cr. Affects only narrow bands above ₹50L. | `takehome.calculator.ts:168-171` | Reproduced (`calculateTax`) |
| MONEY-8 | Minor | The salary bar's "Your Offer" marker disappears when the offer is above the axis maximum (recharts `ifOverflow: 'discard'`), i.e. for the strongest offers. | `frontend/src/components/charts/SalaryBar.tsx:51` | Code-read (plus recharts source; `SalaryBar.test.tsx` mocks recharts) |
| MONEY-9 | Minor | **Fixed** in `5811366`, see section 2. Ordinals are hard-coded "th": "1th / 2th / 3th / 22th percentile" in the score note, the results label and the PDF. | `score.rubric.ts:177,182`; `ResultsPage.tsx:221`; `report.service.ts:97` | Reproduced |
| MONEY-10 / SEC-8 | Minor | **Partly fixed** in `5811366`: the drawer's "₹0" and its two branches. Still open: PDF, Compare and salary bar don't use `computeHeadlineTotal` (needs the decision above). Leftover from BEN-1, commit `89e9f6f`. `computeHeadlineTotal` feeds only the Benefits drawer; the PDF, Compare and salary bar read raw `totalCTC`. A base-only letter shows a total in the drawer but "Not extracted" in the PDF and "Not stated" in Compare. The drawer shows "Total compensation ₹0" when the headline is null, and the no-benefits branch still uses `totalCTC` and an un-annualised `baseSalary` (latent). Needs a decision (see above). | `backend/src/modules/benefits/benefits.service.ts:60-61,73`; `BenefitsPanel.tsx:97`; `comparison.service.ts:60`; `report.service.ts:64-66`; `ResultsPage.tsx` (`userSalary`) | Code-read |
| MONEY-11 | Minor | See SEC-9 (merged there). | — | — |

#### Secondary screens (PDF, share, dashboard, forum, compare, account)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| SEC-1 | Major | See MONEY-6 (merged there). | — | — |
| SEC-2 | Medium | **[visible]** **Fixed** in `e1aa00c`, see section 2. The PDF report prints junk characters for 💡, → and ₹, because the built-in Helvetica font only has WinAnsi glyphs. Every red flag starts with "Ø=Ü¡", every negotiation tip has junk for the arrow, and any ₹ in AI text becomes " ¹". | `backend/src/modules/report/report.service.ts:84,127`; pdfkit 0.17.2 standard fonts | Reproduced (one-off node render, text operators decoded) |
| SEC-3 | Medium | Share copies the results URL, which only the owner can open. Anyone else gets a 404 shown as a generic "Something went wrong" with a retry that never works. Separate from MIN-7. Needs a decision (see above). | `frontend/src/pages/ResultsPage.tsx:71-72,76`; `analysis.routes.ts:17`; `backend/src/shared/access/offer-access.ts` | Code-read |
| SEC-4 | Medium | See FLOW-3 (merged there). | — | — |
| SEC-5 | Medium | The Forum list has no pager. The backend returns 20 posts per page and `page` is never incremented, so posts after the 20th per category cannot be reached. Separate from MIN-10. | `backend/src/modules/forum/forum.service.ts` (`listPosts`); `frontend/src/pages/ForumPage.tsx:26,75` | Code-read |
| SEC-6 | Medium | COR-1 x NEG-2 interaction: correction does not invalidate the cached negotiation email. After a CTC correction, reopening the Negotiation drawer shows the old email quoting the old salary, and Copy copies it; getting a correct one costs a daily credit. The Benefits drawer is also stale for up to 30 s. | `frontend/src/components/offers/CorrectionsPanel.tsx:94-95`; `NegotiationPanel.tsx:30-34`; `BenefitsPanel.tsx:33` | Code-read |
| SEC-7 | Minor | If a route chunk fails to load (stale chunk after a deploy, flaky network), "Try again" never recovers because `React.lazy` caches the rejected import. The fallback also has no navbar. | `frontend/src/App.tsx:29-43,62`; `components/common/ErrorBoundary.tsx:48` | Reproduced (vitest; the lazy factory was called once only) |
| SEC-8 | Minor | See MONEY-10 (merged there). | — | — |
| SEC-9 / MONEY-11 | Minor | **Fixed** in `e1aa00c`, see section 2. The PDF formats money with `toLocaleString()` and no locale ("1,200,000"), while the page uses en-IN ("12,00,000"). PDF score colour bands differ from the gauge (72 is amber in the PDF, green on the page). | `backend/src/modules/report/report.service.ts:62,65,100,162-166`; `frontend/src/components/charts/ScoreGauge.tsx` | Code-read |
| SEC-10 | Minor | Data export, account deletion and offer deletion exist only on the backend; no screen reaches them, though `docs/roadmap.md` lists export and deletion as user rights. Account deletion does not purge in-flight `offer_files`. Needs a decision (see above). | `backend/src/modules/user/user.routes.ts`, `user.service.ts:140,183`; `offer.routes.ts:233`; no entry in frontend `ENDPOINTS` | Code-read |
| SEC-11 | Minor | Dashboard and Compare lists can be up to 30 s stale after a new analysis or a correction, because nothing invalidates their query keys. Compare keeps the previous result table after the selection changes. | `frontend/src/App.tsx:47-52`; `DashboardPage.tsx:21,26`; `ComparePage.tsx:42` | Code-read |

---

## 4. Panel and screen inventory

Status key: **Fixed** = bug fixed on the branch. **Broken** = open bug above. **OK** = read, no known
bug. **Not reviewed** = not looked at.

### Drawer panels on the results page

| Panel | Frontend | Backend | Status | Open items |
|---|---|---|---|---|
| Negotiation | `components/offers/NegotiationPanel.tsx` | `modules/negotiation/*`, `providers/ai/base.ai.ts` | **Fixed** | NEG-1 to NEG-10 (this session, two passes) |
| Benefits calculator | `components/offers/BenefitsPanel.tsx`, `charts/BenefitsPie.tsx` | `modules/benefits/*` | **Broken** (minor) | BEN-5 open. BEN-1, BEN-2, BEN-3, BEN-4 fixed this session. |
| Career path | `components/offers/CareerPathPanel.tsx`, `CareerProgression.tsx`, `charts/CareerTimeline.tsx` | `modules/career/*`, `providers/ai/career.prompt.ts` | **Broken** (minor) | CAR-2 open. CAR-1 fixed this session. |
| Corrections | `components/offers/CorrectionsPanel.tsx` | `modules/correction/*` | **Broken** (minor) | COR-3 open (rate limit). COR-1, COR-2, COR-4 fixed this session. |

### Inline sections of the results page

| Section | Status | Notes |
|---|---|---|
| Score header and gauge | OK | Frontend read; `ScoreGauge.tsx` itself not read |
| Score breakdown | Not reviewed | Frontend read only; backend rubric not verified |
| Salary comparison | OK | `SalaryBar.tsx` read; `BenchmarkNotice.tsx` has tests |
| Red flags | OK | Frontend read only |
| Negotiation tips | **Broken** | NEG-3 (button hidden when empty) |
| Take-home | Not reviewed | Frontend read only; backend `takehome.calculator` not verified. It is a money figure, so review it first. |
| Benefits overview and checklist | Not reviewed | Frontend read only; checklist logic not verified |
| Contribute salary card | OK | Read; has tests; request shape matches the backend schema. Not exhaustively verified. |
| PDF download and share | **Broken** (minor) | MIN-7 |

### Screens

| Screen | Status | Notes |
|---|---|---|
| Login | **Fixed** | B9 |
| Signup | OK | MIN-8 for the popup variant |
| Upload | **Broken** (minor) | MIN-2, MIN-3, MIN-4 |
| Processing | **Broken** (minor) | MIN-5 |
| Results page shell | OK | MIN-7, MIN-12 |
| Dashboard | **Fixed** | B3, B4, B5, X2. MIN-1 open (cache on logout). |
| Compare | **Fixed** | B5 (names). Result table logic not verified. |
| Forum list and post | **Fixed** | B1, B2, X1. MIN-9 open. |
| Feature requests | **Fixed** | B6, B7, B8, S1. MIN-10 open. |
| Salary Explorer | **Fixed** | SAL-1 (this session) |
| Salary contribute form | OK | Has tests |
| Navbar, protected routes, app routes | OK | |
| Landing page components (`components/landing/*`) | Not reviewed | |
| Charts: `ScoreGauge`, `useGaugeCountUp` | Not reviewed | |
| `ErrorBoundary`, `PageShell`, other common components | Not reviewed | |
| shadcn `components/ui/*` | Not reviewed | Generated library code |

### Backend areas

Only the parts the frontend calls were reviewed. **Not reviewed**: the auth service internals, the
offer upload and analysis worker pipeline, the scoring rubric, take-home tax calculator, PDF report
generation, salary service internals, quota service, OCR providers, and rate limiter.

---

### Review log (which pass each panel has had)

| Panel | Passes done |
|---|---|
| Negotiation | Read pass, then a full `/code-review` pass (2026-10-18). All of NEG-1..10 fixed this session via two design/implement-and-review workflows (backend `2b7b3f5`, frontend `58c2fd9`). |
| Benefits | Read pass plus reproductions (BEN-1, 3, 4). BEN-1, BEN-3, BEN-4 fixed this session (implement-and-review workflows). BEN-2, BEN-5 still open. |
| Career | Read pass. CAR-1 fixed this session (implement-and-review workflow). CAR-2 (backend concurrent-AI-call) still open. |
| Corrections | Read pass. COR-1 confirmed by investigation, then fixed Option A this session (design + implement-and-review workflow); COR-2 and COR-4 fixed alongside it. COR-3 still open. |

## 5. Suggested order of work

1. **Benefits** (BEN-1, BEN-3, BEN-4 done this session; BEN-2 next under Model A): it shows wrong money to every user who opens it.
2. **Deploy the existing branch**: merge it, deploy backend then frontend. S1 is a live privacy leak until then. Note: COR-1's migration 0009 needs a real-Postgres run + snapshot/journal regen before deploy.
3. **COR-1 done this session** (Option A, applies corrections; COR-2/COR-4 fixed alongside). COR-3 (rate limit) still open.
4. **Negotiation done this session** (all of NEG-1..10, backend + frontend passes).
5. **SAL-1 and CAR-1 done this session.** (CAR-2 backend concurrent-AI-call still open.)
6. Review the Take-home, Score breakdown and Benefits checklist sections, then the landing page.
7. Minor items.

### New order after the 2026-10-18 bug hunt

- (a) **Batch 1 (done):** FLOW-2 (`84badcd`) and FLOW-1 / AUTH-2 (`9f1c64c`). AUTH-3 is now more urgent because of its interaction with the FLOW-1 fix.
- (b) **Results-page visible bugs (done):** MONEY-2, FLOW-3 / SEC-4, MONEY-6 / SEC-1, MONEY-9, MONEY-10 (drawer part), in `5811366`.
- (c) **Sessions (done):** AUTH-3, AUTH-4, AUTH-5, plus MIN-1, in `ab07808`.
- (d) **PDF (done):** SEC-2 and SEC-9, in `e1aa00c`.
- (e) **AUTH-1 (done):** in `602bee5`; needs a real Google login test before deploy. Follow-up AUTH-8 (pre-account hijacking) fixed with decision (a).
- (f) **Remaining money:** MONEY-1, MONEY-3, MONEY-4, MONEY-5, MONEY-7.
- (g) The rest.

## 6. Keeping this file honest
- IDs are stable; do not renumber. Add new bugs with the next free ID in their group.
- Move a bug to section 2 only after the fix is committed, and record the commit.
- When something is verified in a real browser or a real Postgres, say so in the Evidence column.
