# SPEC — Fix frontend/backend contract breaks

Status: draft for review · Source: frontend code review of `main` (ea672ae), re-verified against backend

## 1. Problem

Four screens are broken because the frontend and backend disagree on field names and shapes. No
tests or type checks catch it: every payload is read through `any`, and `app.contract.test.ts`
only asserts that routes exist, not what they return. The result:

| # | Screen | User-visible effect |
|---|---|---|
| B1 | Forum | Creating a post or a comment fails (500). Nothing is shown to the user. |
| B2 | Forum | Post bodies and comment text render blank. Authors show "Anonymous" in the list and on comments. |
| B3 | Dashboard | Stat tiles always read 0 / "—" / "—" / 0. |
| B4 | Dashboard | Pagination never appears, so only the first 20 offers are reachable. |
| B5 | Dashboard, Compare | Company and Role are always "—" / "Unknown — Role". |
| B6 | Feature requests | The "in progress" filter returns 400, so the page shows its error state. |
| B7 | Feature requests | Vote counts always show 0. |
| B8 | Feature requests | Submitting a too-short title or description does nothing, with no feedback. |
| B9 | Login | A wrong password reloads the page. The error message and `?returnUrl=` are lost. |

## 2. Decision: which side moves

Backend responses and `docs/api-spec.md` are the source of truth, so **the frontend adapts**. The
one exception is the dashboard (B3–B5), where the backend does not return data the UI needs
(company, role, best score). Those get small, additive backend changes. No existing field is
renamed or removed, so nothing else that reads these endpoints can break.

## 3. Scope

In scope: B1–B9.
Also in scope (decided): score sort with `NULLS LAST` (R3) and a fixed forum category list (R1).
Out of scope: guest-offer claiming on email login, the minor review items (cache clearing on
logout, console logging, `.txt` in the file picker, stale model advice, stale extracted text),
and the panels and salary pages the review did not cover. Each of these gets its own ticket.

## 4. Requirements

### R1 — Forum (B1, B2) · frontend only
File: `frontend/src/pages/ForumPage.tsx`

- Create post sends `{ title, content, category }`. Create comment sends `{ content }`.
- Post list author: `p.authorName`. Comment author: `c.authorName`.
- Post body: `post.content`. Comment text: `c.content`.
- Post detail author stays `post.author?.name`, because the backend does return `author` there.
- Both mutations get an `onError` toast. Both stay disabled while pending.
- **Category is a fixed list** (decided): `negotiation | career | advice | general`. The create dialog
  replaces the free-text input with a `Select`, defaulting to `general`. The list page gets a
  matching category filter (it already sends `category` to the API).
- Backend: fill the empty, unused `forum.schema.ts` with Zod schemas and attach them to the
  forum routes in `forum.routes.ts`. Create post: `title` 3–200, `content` 1–10000,
  `category` enum above (default `general`). Create comment: `content` 1–5000. List: `category`
  optional enum, `page` coerced int ≥ 1. A bad request returns 400 instead of a 500 from the
  database. Posts already stored with a category outside the list stay readable and are shown
  as-is, and they are not migrated.

### R2 — Feature requests (B6, B7, B8) · frontend only
File: `frontend/src/pages/FeatureRequestsPage.tsx`

- The status filter sends the enum values `open | planned | in_progress | done`. Display text
  may still read "in progress". Map value to label instead of reusing one string.
- The `STATUS_COLORS` key `"in progress"` becomes `in_progress`. The lookup must be
  `STATUS_COLORS[r.status]`, and the displayed label replaces `_` with a space.
- Vote count reads `r.voteCount`.
- The form enforces `minLength` 5 / `maxLength` 200 on title and `minLength` 20 / `maxLength` 2000
  on description, with a short hint under each field. Submit is disabled until valid.
- Submit and vote both get an `onError` toast.
- Show `r.hasVoted` on the vote button (pressed state). Without this, a repeat vote looks like a bug.

### R3 — Dashboard data (B3, B4, B5) · backend additive + frontend
Files: `backend/src/modules/user/user.service.ts`, `frontend/src/pages/DashboardPage.tsx`,
`frontend/src/pages/ComparePage.tsx`

Backend, additive only:
- `getOfferHistory` also selects `analyses.extractedData` and returns, per offer,
  `company` (`extractedData.companyName ?? null`) and `role` (`extractedData.role ?? userContext.role ?? null`).
  Do **not** return the raw `extractedData` or `rawText` blob in the list. The list should get lighter, not heavier.
- `getDashboardStats` also returns `bestScore` (max score or `null`).
- `sort=score` orders `analyses.score DESC NULLS LAST` (decided), so offers with no analysis
  fall to the end of the list. `desc(...)` in Drizzle needs `sql\`... DESC NULLS LAST\``.
  Pagination must stay stable: add `offers.id` as a tiebreaker to both sort orders.

Frontend:
- Stat tiles read the real fields: **Total Offers** (`totalOffers`), **Analysed** (`completedAnalyses`),
  **Avg Score** (`averageScore`), **Best Score** (`bestScore`). "Active Offers" is dropped (decided),
  because the backend has no such concept and inventing one is worse than omitting it.
- Pagination reads `offersData.pagination.totalPages`.
- Table and Compare read `o.company` / `o.role`. Fall back to "—" only when they are truly `null`.

### R4 — Login error handling (B9) · frontend only
File: `frontend/src/services/api.ts`

- The response interceptor must not refresh-and-redirect for the credential endpoints
  (login, signup, google, refresh). Their 401 goes straight to the caller. Logout is deliberately
  left in the refresh flow, so an expired token still refreshes and the server-side refresh token
  is revoked.
- The no-refresh-token path must not leave `isRefreshing = true`. Set it only after the
  token check, or reset it on that branch.
- Redirecting to `/login` on a failed refresh must carry `?returnUrl=<current path>`.
  It must also be skipped when the user is already on `/login`.

### R5 — Stop it recurring
- Add typed response interfaces for forum, feature requests, user offers and dashboard stats
  (`frontend/src/types/api.ts`) and use them in these pages in place of `any`.
- Add a backend contract test per endpoint above that asserts the response keys the frontend
  depends on. It is the mirror of the frontend types, so a rename fails CI instead of production.

## 5. Acceptance criteria

1. Signed in, creating a forum post and then a comment succeeds. Both appear immediately with
   their text and author name. Reloading shows the same data.
2. The forum list shows real author names. The category control offers only the four fixed values,
   defaults to `general`, and the API rejects any other value with a 400.
3. Feature requests: every status filter returns results (or the empty state), never the error
   state. A request with 42 votes shows 42. A title under 5 or a description under 20 characters
   cannot be submitted and says why. A failed submit or vote shows a toast.
4. Dashboard with 25 offers: the pager appears and "Next" loads offers 21–25. Tiles show real
   totals, average and best score. Each row shows company and role from the analysis, or "—" when
   none was extracted. Compare shows the same names.
5. Entering a wrong password on `/login` keeps the page loaded, shows "Invalid email or
   password.", and keeps `?returnUrl=`. The same holds for signup and Google failures.
6. An expired access token with a valid refresh token still refreshes silently and retries the
   original request. A failed refresh sends the user to `/login?returnUrl=<where they were>`.
7. `npm test` in both `frontend/` and `backend/` passes, including the new tests in section 6.

## 6. Tests

Frontend (Vitest, same setup as `LoginPage.test.tsx` and `UploadPage.test.tsx`):
- `api.test.ts`: a 401 from `/auth/login` rejects without touching `location` or `localStorage`.
  A 401 from `/offers` with a valid refresh token refreshes and retries once. A 401 with no refresh token redirects
  with `returnUrl`.
- `ForumPage.test.tsx`: the create payload uses `content`. A list row renders `authorName`. A comment renders `content`.
- `FeatureRequestsPage.test.tsx`: the filter request carries `status=in_progress`. `voteCount` renders. A short
  form keeps submit disabled.
- `DashboardPage.test.tsx`: tiles from `{ totalOffers, completedAnalyses, averageScore, bestScore }`. The pager
  appears when `pagination.totalPages > 1`. A row renders `company` and `role`.

Backend (Vitest, as in the existing `*.test.ts` files):
- `getOfferHistory` returns `company` and `role` and does not return `extractedData` or `rawText`.
- `getDashboardStats` returns `bestScore`, and `null` for a user with no analyses.
- `getOfferHistory` with `sort=score` returns analysed offers first (descending), unanalysed last,
  and the same offer never appears on two pages.
- Forum create rejects a category outside the list and a missing `content` with 400.
- Contract tests for forum list/create/detail/comment and feature-request list responses.

## 7. Risks and open questions

- **Adding `company` / `role` to the offers list** does a join on `extractedData`, which is a JSONB
  column already read elsewhere. Page size is capped at the existing `limit`. Confirm there is no
  performance concern at current data volumes.
- **Existing forum rows** may hold free-text categories from the old input. They remain readable
  but cannot be selected in the filter. If that matters, a one-off data migration to `general` is a
  separate ticket.
- **Adding Zod validation to forum routes** turns previously accepted (but failing) requests into
  explicit 400s. Check that no other client posts to these endpoints with other field names.

### Decisions (resolved)
1. Drop "Active Offers" from the dashboard: yes.
2. Score sort puts unanalysed offers last, in scope now: yes.
3. Forum category is a fixed list: `negotiation | career | advice | general`.

## 8. Rollout

One PR per requirement group, in this order: R4 (smallest, highest user impact), R1, R2,
R3, then R5 alongside each. R2 and R4 are frontend-only and independently shippable. R1 and R3 touch
the backend as well. For R3, deploy the backend before the frontend, because the frontend reads the new fields. Reading missing
fields renders "—", so deploy order is not a correctness risk.

## 9. Implementation status

R1–R5 implemented on `main` (uncommitted at time of writing). Beyond the spec: `GET /feature-requests`
and `POST /feature-requests` no longer return `submittedByFingerprint` / `submittedByIp` (found
while writing the R5 contract test). Response contract tests live in
`backend/src/response-contract.test.ts` and mirror `frontend/src/types/api.ts`.
Not verified against a real Postgres (none available locally): the dashboard sort SQL and the
list query are checked as generated text and through a recording stand-in for the database.
