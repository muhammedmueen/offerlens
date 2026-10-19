# Known bugs and review status

**This file is the single source of truth for the code-review work on OfferLens.** If you start a
new session, read this first. Keep it updated: when a bug is fixed, move it to the Fixed section
with the commit, and when a panel is reviewed, update the inventory.

Last updated: 2026-10-18 · BEN-1 and COR-1/COR-2/COR-4 fixed this session (uncommitted) · Companion doc:
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
| B9 | Login: a wrong password reloaded the page, losing the error and `?returnUrl=` | Credential endpoints (login/signup/google/refresh) skip the refresh-and-redirect path. A failed refresh redirects with `returnUrl`. The stuck refresh lock is fixed. Logout deliberately still refreshes. |
| S1 | **Privacy leak**: public `GET`/`POST /feature-requests` returned every submitter's `submittedByFingerprint` and `submittedByIp` | Both endpoints now exclude those fields. Anything already deployed still leaks until this ships. |
| X1 | Forum category was free text | Fixed list `negotiation`, `career`, `advice`, `general`, validated on the backend, dropdown and filter on the frontend. |
| X2 | Dashboard score sort put unanalysed offers first, and paging could repeat or skip rows | `NULLS LAST` plus an offer-id tiebreaker. |

**Fixed this session (2026-10-18), committed on `fix/frontend-backend-contract-drift`, not yet merged/deployed, not reviewed in a browser/real Postgres.** Benefits fixes (BEN-1/2/3/4) in commit `89e9f6f`; Corrections fixes (COR-1/2/4) in commit `4771e5a`.

| ID | Bug | What was done |
|---|---|---|
| BEN-1 | Benefits total compensation wrong for CTC-only letters (collapsed to the benefits sum; adding a benefit dropped the total) | With-benefits branch no longer rebuilds the total from `baseSalary + variablePay + benefitsTotal`. New pure helpers `annualizeBase()` (normalizes `baseSalary` by `period`) and exported `computeHeadlineTotal()` = `max(totalCTC, annualizedBase + variablePay)`; benefits surfaced separately, never summed into the headline. Verified by repro: CTC-only ₹12,00,000 + ₹10,000 benefit now shows ₹12,00,000 (was ₹10,000); all-unvalued shows ₹12,00,000 (was ₹0); monthly base annualizes. 7 new unit tests in `benefits.service.test.ts`. `ponytail:` comment names the on-top-of-CTC vs part-of-CTC ceiling. |
| BEN-3 | Any failed benefits request (429/404/500/network) showed "No benefits data found... total comp equals your base CTC" because the query never read its error state; Recalculate had no failure feedback | `BenefitsPanel.tsx` now places an error/retry guard BEFORE the empty-breakdown check, so a failed request shows a real error + retry (429 uses the shared quota/rate-limit helpers and retry predicate per CareerPathPanel). The "no benefits data" copy is preserved verbatim for the legitimate success-but-empty case. A failed Recalculate now surfaces an alert (declarative `recalculate.error` render), without touching the success path (BEN-4 left out of scope). 5 new frontend tests; suite 169 → 174, tsc clean. |
| BEN-4 | "Recalculate with my values" didn't change the headline totals — they reverted (onSuccess `refetch()` of the no-override query clobbered the recalculated result; pie/inputs kept the overrides, totals snapped back) | `BenefitsPanel.tsx` removes the stray `onSuccess: refetch()` and reads every headline/breakdown figure from a single derived `view = recalculate.data ?? data`, so the recalculated result wins and no longer reverts on a settled refetch. BEN-3 error handling untouched. 1 new frontend test (forces every post-recalculate call to the original payload and asserts the original total is gone and stays gone); suite 174 → 175, tsc clean. **Note (resolved by decision):** the backend headline total does not move with benefit overrides. Per the Model A decision below, this is correct — benefits are part of CTC, so overriding a benefit changes the breakdown/pie, not the headline. The BEN-2 work carries the UI note making this explicit. |
| COR-1 | Corrections saved but never applied (Option A chosen: apply them) | Corrections now overlay onto `analyses.extractedData` in one transaction, so every reader (`getAnalysis`, benefits, career, export) picks them up; reopening shows the corrected value. A `totalCTC` correction triggers a targeted deterministic recompute of `takeHome` (exact) and score/percentile (approximate interpolation against the 4 stored market points; unscored salaries early-return so no sub-score is invented), wrapped in `optionalStage` to fail soft. Frontend invalidates `["analysis", offerId]` on a real change and the toast only claims "applied" when the server reports `changed`. New `correctable-fields.ts` allowlist; 28 new backend + 3 new frontend tests. |
| COR-2 | Each correction save cleared the career cache, wasting a daily career credit | Career cache dropped only when a changed field is role/location (`CAREER_RELEVANT_FIELDS`); a `totalCTC`/notice/probation correction leaves it intact. |
| COR-4 | `field` any string, `correctedValue` `z.any()` — table could fill with junk / arbitrary jsonb write | Six-path allowlist in `correctable-fields.ts` validated before any write (rejects non-allowlisted paths incl. prototype pollution), per-field value typing (finite non-negative CTC; string ≤200 chars for text). `correction.schema.ts` `field` tightened to `z.enum` from the shared constant. |

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

### Negotiation panel (usable, but wastes quota)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| NEG-1 | Medium | A failed AI call is shown, and charged, as a real script. The provider catches its own error and returns the stub "I am writing to discuss... [AI generation failed, please use template]" without throwing. The service labels it `personalized` and keeps the quota unit. | `backend/src/providers/ai/base.ai.ts` (`generateNegotiationScript` catch), `negotiation.service.ts` | Code-read (the service comment admits it) |
| NEG-2 | Medium | Closing the drawer loses the generated script (plain component state; the sheet unmounts). Regenerating spends another of the 10 daily credits. | `frontend/src/components/offers/NegotiationPanel.tsx`, `pages/ResultsPage.tsx` drawers | Code-read |
| NEG-3 | Medium | "Generate Negotiation Email" only appears when negotiation tips exist, though the backend has a template path for exactly the thin-data case. | `frontend/src/pages/ResultsPage.tsx` (Negotiation Tips block) | Code-read |
| NEG-4 | Minor | Copy button copies the body but not the subject, and shows "Copied!" even if the clipboard write fails (the promise is neither awaited nor caught). A 429 shows the generic error instead of the rate-limit text. Unused `Download` import. | `NegotiationPanel.tsx` | Code-read |
| NEG-5 | Medium | The template email mislabels the CTC as base pay: "Base salary: [YOUR TARGET FIGURE] (current offer: ₹18,00,000)" where 18,00,000 is `totalCTC`. This is the CTC-as-basic conflation task 9 removed. The user sends a base-salary ask anchored to the CTC figure to a hiring manager. | `backend/src/modules/negotiation/negotiation.template.ts` (the `salary` point) | Reproduced |
| NEG-6 | Medium | The AI result is returned without checking it has a non-empty `subject` and `body`. Valid JSON with other keys (for example `{email: ...}`) succeeds: the quota unit is spent, the type is `personalized`, and the panel falls back to `JSON.stringify(script)`, showing raw JSON including the suggestions array. Should be validated with Zod and treated as a failure (refund plus template). | `negotiation.service.ts`, `providers/ai/base.ai.ts` (`parseJsonLoose` is only cast) | Code-read |
| NEG-7 | Medium | On a later failed request the previous script stays on screen under the error alert. A stale email for the old tone and focus areas can be copied by mistake. | `NegotiationPanel.tsx` (`script` set only in `onSuccess`) | Code-read |
| NEG-8 | Minor | `focusAreas` accepts any strings (no enum, no length cap, no dedupe). Keys are looked up on a plain object, so `focusAreas: ["constructor"]` puts "function Object() { [native code] }" into the email. Only reachable with a hand-crafted request, since the panel sends a fixed list. Repeats like `["salary","salary"]` give duplicate lines. Fix: `z.enum` plus dedupe, and `Object.hasOwn` or a Map. | `negotiation.schema.ts`, `negotiation.template.ts` (`discussionPoints`) | Reproduced |
| NEG-9 | Minor | A letter with a base salary but no CTC passes `hasNegotiableDetail`, but the template path only passes `totalCtc`, so the email says "(current offer: [OFFERED SALARY])" although basic was extracted. | `negotiation.service.ts` (`template()`) | Code-read |
| NEG-10 | Minor | `script` is typed `any` in the panel, so a non-string `note` or `subject` would throw inside React and replace the panel with the error boundary. A typed response would catch drift. | `NegotiationPanel.tsx` | Code-read |

Negotiation review note: the `/code-review` pass on this panel also suggested refreshing the quota
snapshot after a successful generation. Rejected: nothing in the UI reads the negotiation or career
quota counts, so it has no visible effect.

### Career panel (healthiest)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| CAR-1 | Medium | Errors that cannot succeed are retried three times (for example 400 "Role not identified in offer"), then shown as a generic error with a useless retry button. | `frontend/src/components/offers/CareerPathPanel.tsx` (`retry` predicate) | Code-read |
| CAR-2 | Minor | Two simultaneous opens that both miss the cache both call the AI and both charge a credit (no lock). | `backend/src/modules/career/career.service.ts` | Code-read |

### Corrections panel (looks like it works, changes nothing)

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| COR-3 | Medium | No rate limit. `RATE_LIMITS.corrections` (20/hour) exists but its own comment says it is not wired. Only the global 100/min applies, and each request can insert 20 rows. | `backend/src/config/constants.ts`, `correction.routes.ts` | Code-read |

### Salary Explorer

| ID | Severity | Bug | Where | Evidence |
|---|---|---|---|---|
| SAL-1 | Medium | After the first search, every keystroke in the role or city box fires a request (`searched` stays true and the query key follows the text). Against a 30-per-minute limit this soon shows "Too many requests", and 1-character values hit the backend's 2-character minimum and show the misleading "No data for this combination yet". | `frontend/src/pages/SalaryExplorerPage.tsx` (the `useQuery`) | Code-read |

### Other minor items from the first review

| ID | Bug | Where |
|---|---|---|
| MIN-1 | Logout does not clear the query cache. Dashboard queries are not keyed by user, so a second user on the same tab can briefly see the previous user's offers and scores. | `frontend/src/store/auth.tsx`, `pages/DashboardPage.tsx` |
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
- Logout stays in the refresh flow so the server-side refresh token is revoked.
- COR-1: apply corrections to the analysis (Option A), not relabel as feedback. Done this session: targeted deterministic recompute (overlay corrected fields onto `extractedData`; recompute take-home exactly and score/percentile approximately on a `totalCTC` change; do not fake a role/location re-benchmark).
- Benefits model (Model A): benefits are **part of** the CTC, not on top of it. The headline "Total compensation" is always the CTC (`max(totalCTC, annualizedBase + variablePay)` per BEN-1) and never moves when a benefit value is overridden — Recalculate changes the breakdown/pie only. No "on-top-of-CTC" benefit flag is added (Model B rejected). Drives BEN-2: insurance cover (sum assured) is coverage, not money, and no benefit adds to the headline total.

### Decisions still needed
- MIN-6: should email login claim guest offers like signup does?

---

## 4. Panel and screen inventory

Status key: **Fixed** = bug fixed on the branch. **Broken** = open bug above. **OK** = read, no known
bug. **Not reviewed** = not looked at.

### Drawer panels on the results page

| Panel | Frontend | Backend | Status | Open items |
|---|---|---|---|---|
| Negotiation | `components/offers/NegotiationPanel.tsx` | `modules/negotiation/*`, `providers/ai/base.ai.ts` | **Broken** | NEG-1 to NEG-10 |
| Benefits calculator | `components/offers/BenefitsPanel.tsx`, `charts/BenefitsPie.tsx` | `modules/benefits/*` | **Broken** | BEN-2, BEN-5 open. BEN-1, BEN-3, BEN-4 fixed this session (uncommitted). |
| Career path | `components/offers/CareerPathPanel.tsx`, `CareerProgression.tsx`, `charts/CareerTimeline.tsx` | `modules/career/*`, `providers/ai/career.prompt.ts` | **Broken** (minor) | CAR-1, CAR-2 |
| Corrections | `components/offers/CorrectionsPanel.tsx` | `modules/correction/*` | **Broken** (minor) | COR-3 open (rate limit). COR-1, COR-2, COR-4 fixed this session (uncommitted). |

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
| Salary Explorer | **Broken** | SAL-1 |
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
| Negotiation | Read pass, then a full `/code-review` pass (2026-10-18). NEG-5 and NEG-8 reproduced; NEG-6, 7, 9, 10 code-read. |
| Benefits | Read pass plus reproductions (BEN-1, 3, 4). BEN-1, BEN-3, BEN-4 fixed this session (implement-and-review workflows). BEN-2, BEN-5 still open. |
| Career | Read pass. No dedicated `/code-review` pass yet. |
| Corrections | Read pass. COR-1 confirmed by investigation, then fixed Option A this session (design + implement-and-review workflow); COR-2 and COR-4 fixed alongside it. COR-3 still open. |

## 5. Suggested order of work

1. **Benefits** (BEN-1, BEN-3, BEN-4 done this session; BEN-2 next under Model A): it shows wrong money to every user who opens it.
2. **Deploy the existing branch**: merge it, deploy backend then frontend. S1 is a live privacy leak until then. Note: COR-1's migration 0009 needs a real-Postgres run + snapshot/journal regen before deploy.
3. **COR-1 done this session** (Option A, applies corrections; COR-2/COR-4 fixed alongside). COR-3 (rate limit) still open.
4. **Negotiation** NEG-1 (stub script charged), NEG-6, NEG-5 (CTC labelled as base), then NEG-2, NEG-3, NEG-7.
5. **SAL-1** and **CAR-1**.
6. Review the Take-home, Score breakdown and Benefits checklist sections, then the landing page.
7. Minor items.

## 6. Keeping this file honest
- IDs are stable; do not renumber. Add new bugs with the next free ID in their group.
- Move a bug to section 2 only after the fix is committed, and record the commit.
- When something is verified in a real browser or a real Postgres, say so in the Evidence column.
