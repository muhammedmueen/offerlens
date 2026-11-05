# OfferLens — End-to-End UI Test Guide

A human-followable walkthrough of every screen and flow. Click through top to bottom; each
step lists the exact action and what you should see. Tick the boxes as you go.

This is the **manual** counterpart to the Playwright suite in `frontend/e2e/`, which automates
most of the checks below (see the end of this guide for what it leaves to you). This guide covers
what a machine can't judge — does it *look* right, does the motion feel calm, does it hold up with
the real AI, on the live site and with a real keyboard.

Quoted text is the exact on-screen wording, copied from `frontend/src`. `{braces}` and `N` mark
values the app fills in. If the app shows different wording, note it. Browser and OS menu
names are in *italics*.

---

## 0. Before you start

### Where are you testing?

| Target | Base URL | When to use |
|--------|----------|-------------|
| **Live** | https://offerlens.mueens.tech | Final sign-off before calling a change shipped. The real stack: OCR, Gemini, Postgres, prod build. |
| **Local** | http://localhost:8080 | While developing. Needs the full stack up (see `docs/LOCAL_DEVELOPMENT.md` §6): Postgres, Redis, API, workers, `npm run dev`. Without workers the offer stays QUEUED (the processing page shows "Uploading" as the active step) and the page gives up after 5 minutes (§5b). |

Pick one and use it for the whole pass. Don't mix — a local build and the live build can differ.

### Test accounts & data

- **Fresh guest**: open an **incognito/private window** so you start with no cookie and no
  account. This is how you test guest gating.
- **Registered user**: sign up a throwaway account (`you+test1@gmail.com` style).
- **Daily limits** (reset at 00:00 IST):
  - Guest: analysis 1/day, autofill 30, career 0, negotiation 0.
  - Free account: analysis 3/day, autofill 30, career 10, negotiation 10.
  - Signup is limited to 5 per hour per IP. Plan your throwaway accounts.
- **Sample offer text**: use the corpus letters if you have the repo open
  (`backend/eval/corpus.ts` — e.g. `01-indian-product-clean`, `05-red-flag-heavy`), or paste any
  real offer-letter text. For a clean run use a well-formed letter; for red-flag testing use one
  with a bond/non-compete/vague comp. Re-submitting the **same text** from the same account
  returns the existing offer, so use different letters when you need two offers.

### Browser setup

- Open **DevTools → Console** and keep it visible the whole run. Some console output is
  **expected by design** and is not a failure:
  - the NotFound page logs "404 Error: User attempted to access non-existent route:" (§12);
  - an error boundary logs "[ErrorBoundary]" when it trips (§12);
  - a build without a Google client id warns "VITE_GOOGLE_CLIENT_ID is not set. The Google sign-in buttons are hidden." (§7b);
  - expected 401 and 404 responses show as red network lines, and a 403 on `/users/me` right after
    a dead session (§12);
  - the upload page logs a lot of `[Upload]` lines (noisy, not red).

  **Any other red error = a failure**, even if the screen looks fine. Note it against the step
  you were on.
- Open **DevTools → Network** for the asset-hash check in step 1.
- Do every page at least once at **desktop width** and spot-check 2–3 at **mobile width**
  (DevTools device toolbar, ~390px).

### Pass/fail convention

- ✅ matches the **Expect** line → tick the box.
- ❌ doesn't → leave unticked, write what you saw + which step + any console error.

---

## 1. First load & asset sanity

- [ ] Open the base URL in a **fresh incognito window**. Hard-refresh (**Ctrl/Cmd+Shift+R**).
- [ ] **Expect**: the landing page renders fully styled — not a wall of unstyled text, not a
  blank white screen. (A blank/unstyled page on live usually means `frontend/dist` permissions;
  see `docs/DEPLOY_VPS.md`.)
- [ ] DevTools → Network → filter JS. Note the main entry chunk name (e.g.
  `index-XXXXXXXX.js`). On live, confirm it's the hash from your most recent deploy — if it's an
  old hash, the browser or server is serving a stale build and nothing below reflects your
  changes.
- [ ] **Console**: no red errors on load other than the expected ones listed in §0.

---

## 2. Motion & page-transition check (do this deliberately)

This is the part only a human can judge. Navigate **slowly** and watch the transition itself.

### 2a. Page transitions — no flicker

The flicker fix is commit `02ca97e`. **Confirm the deployed asset hash first** (§1). On a build
older than that, a skeleton flash is the known bug, not a new one.

- [ ] From the landing page, click "Forum" (footer). Watch the moment of navigation.
- [ ] **Expect**: the current page holds briefly while the next one loads, then the new page
  **fades in once**. You should **NOT** see:
  - a blank/white flash,
  - a loading skeleton flashing then being replaced (the old double-flicker),
  - the page height jumping mid-transition.
- [ ] Repeat for each nav hop and watch each one: **Home → "Salaries" → "Forum" → "Feedback" →
  Home**, then (signed in) **"Dashboard" → "Compare"**.
- [ ] Navigate **back/forward** with the browser buttons a few times. Same calm single fade,
  no flash.
- [ ] **Expect overall**: transitions feel like a quiet SaaS app — a gentle settle, not
  theatrical, not jarring.

### 2b. Scroll reveals

- [ ] On the **landing page**, scroll down slowly from the top.
- [ ] **Expect**: sections fade + rise gently into view as they enter, once each. Not every
  element popping at once; not re-animating when you scroll back up.

### 2c. Reduced motion (accessibility)

- [ ] Turn on reduced motion, using one of:
  - Windows 11: *Settings → Accessibility → Visual effects → Animation effects* off.
    Windows 10: *Settings → Ease of Access → Display → Show animations in Windows* off.
  - macOS 14: *System Settings → Accessibility → Display → Reduce motion*.
    macOS 15 and later: *System Settings → Accessibility → Motion → Reduce motion*.
  - Chrome/Edge DevTools: *⋮ → More tools → Rendering → Emulate CSS media feature
    prefers-reduced-motion → prefers-reduced-motion: reduce*.
- [ ] Reload and repeat 2a + 2b, and load the landing page hero from the top.
- [ ] **Expect**: no rise or slide anywhere, including the landing hero and its offer
  illustration. At most a short opacity fade on page change. Red-flag cards on a results page
  appear together, with no stagger. Nothing is hidden or stuck invisible.
- [ ] **Known defect, report it if you see it**: the cards on the Dashboard stat row, the
  Forum list and the Feature Requests list use `MotionCard`, which does not check reduced
  motion. They still rise 16px on scroll and lift on hover.
- [ ] Turn the setting back off after.

---

## 3. Landing page

- [ ] Hero renders: the headline "Is this offer actually good?", sub-copy, the primary
  call-to-action and the "Modelled numbers stay labelled." note.
- [ ] Every section below the fold renders with real content (no placeholder lorem, no broken
  layout): "Three steps, no account needed", "What a verdict looks like", "The clauses most
  people skim past", "See what your letter really says".
- [ ] Navbar (desktop): "Upload", "Forum", "Salaries", "Requests", plus "Log in" / "Sign up"
  as a guest.
- [ ] Footer: links "Forum", "Salaries", "Feedback", and the "Built by Mueen · mueens.tech"
  credit. Click the credit → opens https://mueens.tech in a new tab.
- [ ] Both "Drop or paste your offer" buttons (hero and closing section) → go to `/upload`.
- [ ] Mobile width: hero and sections stack cleanly, nothing overflows horizontally, no
  tiny-tap-target buttons. The navbar collapses to a menu button ("Open menu").

---

## 4. Guest gating & guest flow (incognito, not signed in)

OfferLens lets guests analyze, but gates the extras. Verify the walls are up.

### 4a. Guest quota on `/upload`

- [ ] As a guest, go to `/upload`. **Expect** the line "1 of 1 analysis left today" above the
  tabs.
- [ ] Run one analysis (full steps in §5). A guest **can** do a basic analysis.
- [ ] Go back to `/upload`. **Expect** the exhausted-quota box: "You've used today's free
  analysis. It resets at 12:00 am IST. Create a free account to get 3 analyses a day." with a
  "Create free account" button. Paste text and fill the form: "Analyze My Offer" stays
  **disabled**.

### 4b. Guest results page

- [ ] On the guest results page, **expect** the guest banner at the top: "{N}h left" (hours
  until this guest result expires), "Sign up to save this analysis, compare offers, and get
  negotiation scripts." and a "Create Free Account" link.
- [ ] Click each registered-only action: "Generate Negotiation Email" (in "Negotiation Tips"),
  "Calculate Full Benefits Value" (in "Benefits Overview"), and from the bottom bar "Career",
  "Correct", "Compare" and "PDF".
- [ ] **Expect**: each shows a lock icon and opens the "Create a Free Account" dialog, whose
  text names the feature: "Sign up to unlock {feature}, save your analyses, and more." The
  feature names are "Negotiation Scripts", "Benefits Calculator", "Career Path", "Corrections",
  "Compare Offers" and "PDF Download". Nothing silently does nothing; nothing just works.
- [ ] "Share" is **not** gated (§5d).

### 4c. Guest isolation

- [ ] Copy the results URL (`/offers/<id>`). Open it in a **different browser** (or a normal
  window where you are not this guest).
- [ ] **Expect**: "This analysis isn't ready or isn't available", "It may still be processing,
  it may have failed, or the link may belong to a different account." and a "Check its
  progress" link. The analysis itself is **not** shown.

### 4d. Protected pages

- [ ] Visit `/dashboard` and `/compare` directly as a guest.
- [ ] **Expect**: redirected to `/login?returnUrl=%2Fdashboard` (or `%2Fcompare`), not shown
  the page. After logging in you land back on the page you asked for.

### 4e. Claiming guest offers on signup

Do this in the **same** incognito window that ran the guest analysis.

- [ ] Click "Create Free Account" in the guest banner → `/signup`. Sign up (§7a).
- [ ] **Expect**: you land on `/dashboard` and the guest analysis is listed in "Offer History".
- [ ] Alternative path (use it instead of the banner link, or on a later run): on the guest
  results page click a locked button and sign up inside the "Create a Free Account" dialog.
  **Expect** the dialog closes, you stay on the results page, the lock icons disappear, and the
  offer appears on your dashboard.

---

## 5. Core flow: Upload → Processing → Results

Do this once as a **registered** user (sign up first, §7) so the drawers are reachable.

### 5a. Upload — paste text

- [ ] Go to `/upload`. **Expect** "N of 3 analyses left today" for a free account. Two tabs:
  "Upload File" and "Paste Text".
- [ ] **Paste Text**: paste an offer letter. Once there are more than 20 characters, the "Tell
  us about the role" form appears.
- [ ] Fill "Role / Title \*" (placeholder "e.g. Software Engineer"), "City \*" (placeholder
  "e.g. Bangalore") and pick from "Experience Level \*". "Current CTC (optional)" may stay
  empty. Typing 2+ characters in Role or City may show a suggestion list from the metadata API;
  clicking a suggestion fills the field.
- [ ] "Analyze My Offer" is disabled until text, role, city and level are all present.
- [ ] Click "Analyze My Offer".
- [ ] **Expect**: navigates to `/offers/<id>/processing`.

### 5a-file. Upload — file, autofill and validation

- [ ] "Upload File" tab: the drop zone says "Drop your offer letter here". It is reachable by
  Tab and opens the file picker on Enter or Space.
- [ ] Upload a **text PDF**. **Expect** the toasts "Processing file", then "Text extracted",
  then "Data extracted" ("We've auto-filled some fields from your offer letter."). Role, City,
  Experience Level and Current CTC are filled from the letter where it states them. Autofill
  uses the autofill quota (30/day); when it is used up the toast is "Autofill limit reached"
  and you fill the fields by hand.
- [ ] Upload a **scanned/image PDF or a JPG/PNG**. **Expect** "Scanned document detected" and
  then either "OCR complete" or, where OCR is not configured, the inline notice "Image uploads
  aren't available here. Paste the text instead, or upload a PDF with selectable text." plus
  the toast "Image uploads unavailable". Never a silent hang with no message.
- [ ] Drag a file of another type (e.g. `.docx`) onto the drop zone. **Expect** the inline
  error "Please upload a PDF or image (JPG, PNG)". (`.txt` is accepted by drag and drop.)
- [ ] Drag a PDF larger than 10 MB. **Expect** "File must be under 10MB".
- [ ] Error toasts on submit, if you hit them: "Daily limit reached", "Slow down", "Upload
  failed".
- [ ] On live there is **no** "AI Model (Development Only)" picker. (It shows only in dev
  builds.)

### 5b. Processing

- [ ] **Expect**: the heading "Reading your offer…" with the steps "Uploading", "Reading
  Document", "Analyzing", "Scoring" and live progress. Not a frozen blank page.
- [ ] **Expect**: it **auto-advances** to the results page when done. Usually 15–30s; the page
  itself says up to ~3 min. After 30s it says "Taking a bit longer than usual…", after 60s
  "Still working on it. We'll keep trying." It should not require a manual refresh. Browser
  Back from results skips the processing page.
- [ ] **Console**: no poll-storm (repeated failing requests firing every few ms). Polling
  runs every 3s and stops once COMPLETED.

### 5b-giveup. Processing — 5-minute give-up (local, workers stopped)

- [ ] Stop the workers, submit an analysis and wait 5 minutes on the processing page.
- [ ] **Expect (member)**: "This is taking longer than expected — your analysis may still be
  processing. Refresh in a minute, or check your dashboard." with "Go to Dashboard" and "Try
  Again".
- [ ] **Expect (guest)**: "This is taking longer than expected — your analysis may still be
  processing. Keep this page open and check again in a minute." with "Check again" and "Try
  Again". "Check again" resumes polling.
- [ ] If the status request itself fails, **expect** "Could not load status." with "Try
  again".

### 5c. Results

- [ ] **Expect**: URL is `/offers/<id>`. Page shows: the company as the heading (a real value,
  not the "Company" placeholder), role and city, an overall **score** with a label, "How this
  score was reached", "Red Flags", "Negotiation Tips", "Estimated Take-Home" (when computed),
  "Benefits Overview" with its "Against a standard offer" checklist.
- [ ] "Salary Comparison" appears **only** when the benchmark has all four percentiles. Its
  absence is correct, not a bug.
- [ ] **Score arithmetic**: each "How this score was reached" row shows the component's mark
  out of 100 and "· N% of total". Σ(mark × weight%) / 100 equals the headline score within
  ±1 (rounding). The marks themselves do **not** add up to the score.
- [ ] **Honest-labelling check (important)**: anything *modelled/estimated* must be clearly
  labelled — **not** presented as a verified fact. A mislabel here is a failure even if the
  number looks reasonable.
  - Take-home: the heading is "Estimated Take-Home". The figure is one amount, a range (with
    "A range, because PF depends on your employer's policy"), or "up to ₹…" with text starting
    "Upper bound." directly under it. "What this assumes (N)" expands to the assumptions.
    Variable pay, if any, is shown separately as "(not included)".
  - Salary benchmark: "Modelled" with "Public survey, India-wide" (or "Public survey, adjusted
    for {city}"), or "Based on crowdsourced submissions", or "AI-estimated range — not
    benchmarked against real submissions".
  - Career projection: the drawer says "A projected five-year trajectory for this role, with
    skills and next steps."
  - See **Known issues** about the "Verified" badge next to the take-home estimate.
- [ ] Low-confidence or fallback analyses show their caveat, not a clean confident result: the
  amber caveat box, "We had trouble reading parts of your offer" for a poor scan, or "Estimated
  score — limited market data" under the score.

### 5d. Results — PDF, Share, contribution card

- [ ] **PDF (members only)**: click "PDF" in the bottom bar. **Expect** a download named
  `offerlens-report-<id>.pdf`. Then set DevTools → Network → Offline and click "PDF" again.
  **Expect** the error toast "Download failed" / "Could not download the PDF report. Please try
  again." Go back online. (As a guest, "PDF" opens the sign-up dialog, §4b.)
- [ ] **Share**: click "Share". **Expect** the toast "Link copied" / "The link to this analysis
  is on your clipboard." If the clipboard is blocked, **expect** "Could not copy link" / "Copy
  the address from your browser's address bar instead." The copied link opens only for the
  owner; anyone else sees the §4c page (see **Known issues**).
- [ ] **Contribution card** "Help others see real offers": it appears only for a confident,
  INR, full-time offer with a stated CTC and role. "Review and share" opens the pre-filled
  form; nothing is sent until "Send data point". Type the offer's company name into "Job title"
  and leave the field: **expect** "Remove the company name". After sending, **expect** text
  starting "Thank you. Your data point is added without your name." "No thanks" shows "Got it.
  We will not ask again for this offer." and the card does not come back for this offer.

---

## 6. Results drawers (registered only)

Openers: "Generate Negotiation Email" (inside "Negotiation Tips"), "Calculate Full Benefits
Value" (inside "Benefits Overview"), then "Career" and "Correct" from the bottom bar.
**Expect** no drawer shows its fallback title ("Negotiation script unavailable", "Benefits
calculator unavailable", "Career path unavailable", "Corrections unavailable") and no API error
"Something went wrong. Please try again." inside a drawer.

- [ ] "Generate Negotiation Email" → "Negotiation Script" drawer. Pick a "Tone" and "Focus
  Areas" → "Generate Script" → a script appears with a "Copy" button (can take a while on a
  real AI call). Copy shows the toast "Copied!".
- [ ] "Calculate Full Benefits Value" → "Benefits Calculator" drawer → shows "Benefits value",
  "Total compensation" and a per-benefit breakdown. Edit an amount → "Recalculate with my
  values".
- [ ] "Career" → "Career Path" drawer → shows "Skills to build" and "Roles this could lead
  to" when the AI returns them, and the timeline renders.
- [ ] "Correct" → "Correct Data" drawer → fields "Company name", "Role", "Location", "Total
  CTC", "Notice period", "Probation period" are **pre-filled** from the analysis; the button
  reads "No changes yet" and is **disabled until you change something**. Change a field → it
  reads "Save 1 correction" → save → toast "Corrections applied" and the results page
  refreshes with the new value.
- [ ] Each drawer: opens, **Escape** closes it, focus returns to the button that opened it.
  Keyboard-openable.

---

## 7. Authentication

### 7a. Signup

- [ ] Go to `/signup` ("Create your account"). Fill "Email" + "Password" (min 8 chars);
  "Name (optional)" may stay empty. Submit "Sign up free".
- [ ] **Expect**: lands on `/dashboard`, now signed in.
- [ ] Validation: a bad email or a password under 8 characters is blocked by the **browser's
  own validation tooltip** (no app message). A duplicate email shows "Signup failed. Please try
  again." Not a crash.

### 7b. Google sign-in

- [ ] The Google buttons ("Login with Google" on `/login`, "Sign up with Google" on
  `/signup`) are **hidden** when the build has no `VITE_GOOGLE_CLIENT_ID`. Locally that is
  expected, not a bug.
- [ ] **On live** both buttons **must** show. Click one → Google flow → returns signed in.

### 7c. Login / logout / session

- [ ] Log out ("Account menu" icon → "Log out", lands on `/`), then log back in on `/login`
  ("Welcome back") with the same credentials → `/dashboard`.
- [ ] While logged in, **hard-refresh** → still signed in (session survives reload), no bounce
  to login, no flash of logged-out UI.
- [ ] While logged in, visit `/login` or `/signup`: you land on `/dashboard` instead of the form.
- [ ] Wrong password shows "Invalid email or password."
- [ ] Rate limit: many rapid wrong passwords end in "Too many attempts. Please wait a while
  before trying again." — not a 500. This locks that email's login for 15 minutes; use a
  throwaway email.

---

## 8. Dashboard

- [ ] Shows the stat cards "Total Offers", "Analysed", "Avg Score", "Best Score" and the "Offer
  History" table, or a clean empty state for a brand-new account: "No analyses yet" with
  "Upload Your First Offer".
- [ ] "Upload New" → `/upload`; "Compare" → `/compare`.
- [ ] Each COMPLETED row opens its results page; QUEUED, PROCESSING or FAILED rows open the
  processing page.
- [ ] Sort: "Date" and "Score" reorder the table and go back to page 1.
- [ ] Pagination: "Prev" / "Next" with "{page} / {total}" appear only with more than 20
  offers. Skip if the account has fewer.
- [ ] The dashboard shows **no** quota. Check today's quota on `/upload` ("N of 3 analyses
  left today").

---

## 9. Compare

- [ ] You need **≥2 completed analyses** on the account. Analyse two **different** letters
  (e.g. corpus `05` and `01`); the same letter twice returns the same offer.
- [ ] From a results page, click "Compare" → `/compare`.
- [ ] "Select 2–3 completed offers to compare": tick two offers → "Compare Selected".
- [ ] **Expect**: a table with 11 rows (overall, 5 rubric, 5 facts), ✓ on the winning values,
  and a verdict "On the numbers: {company}" or "On the numbers: too close to call". Numbers
  align to the right offers.
- [ ] Fewer than 2 completed offers: "Not enough offers", "You need at least 2 completed
  analyses to compare." and "Upload Another Offer". Not a broken table.

---

## 10. Salary Explorer

- [ ] Go to `/salaries` ("Salary Explorer"). Open to everyone (guest + registered). Nothing
  loads until you search.
- [ ] Enter Role ("Role (e.g. Software Engineer)") and City ("City (e.g. Bangalore)"), 2+
  characters each, then "Search" or Enter.
- [ ] **Expect** either a P25/Median/P75/P90 bar chart with its source note, or "No data for
  this combination yet." (or the API's own message) plus "Contribute yours".
- [ ] **Honest-labelling check**: the source is labelled — "Modelled" with "Public survey,
  India-wide" or "Public survey, adjusted for {city}", "n = N respondents", and the "Fewer
  than 10 city-level submissions so far." note; or "Based on crowdsourced submissions" for
  crowd data. Modelled ≠ verified.
- [ ] **Contribute flow** (ungated, guests too): "Submit Your Salary" → "Submit salary data"
  dialog. Fields: "Job title", "City", "Years of experience", "Yearly CTC (₹)", "What kind of
  pay is this?", "Company type", "Company size (optional)". Bad input shows the field message
  (e.g. "Enter digits only, for example 2400000"). "Send data point" → toast "Submitted" /
  "Your data point was added."
  A second send from the same browser within an hour shows "You already shared a data point
  from this browser in the last hour. You can share another one later." No name or company is
  echoed back.
- [ ] Mobile width: charts remain readable, don't overflow.

---

## 11. Forum & Feature Requests

### 11a. Forum

- [ ] `/forum` ("Forum"): list of posts renders, or "No posts yet" / "Be the first to start a
  discussion!". Click a post → `/forum/<id>` detail view renders with "Comments (N)".
- [ ] Category filters: "All", "negotiation", "career", "advice", "general" (shown
  capitalised). Each filters the list.
- [ ] As a guest, "New Post" opens the "Create a Free Account" dialog for "Forum posting".
- [ ] Signed in, "New Post" opens the "New Post" dialog with "Title", "Category" and "Body" →
  "Post" → toast "Post created!" and the post is listed.
- [ ] On a post, a guest sees a "Log in" link followed by "to comment". "Log in" goes to
  `/login?returnUrl=%2Fforum%2F<id>` and returns to the post after login. Signed in: "Write a
  comment…" → "Comment" → toast "Comment added!".

### 11b. Feature Requests

- [ ] `/feature-requests` ("Feature Requests"): list renders, or "No feature requests yet. Be
  the first!".
- [ ] Sort "Most Voted" / "Newest"; status filters "All", "Open", "Planned", "In progress",
  "Done".
- [ ] **Open to guests and members.** "Submit Request" → "Submit Feature Request" dialog.
  "Submit" stays disabled until the title has 5+ characters and the description 20+ (hints
  "At least 5 characters (N/200)" and "At least 20 characters (N/2000)"). Submit → toast
  "Request submitted!".
- [ ] Vote once per browser (guests too): click a vote button, the count rises and the button
  disables. To check the server side, open the page in two tabs, vote in one, then vote on the
  same request in the other tab within 30 seconds, without reloading (after that the tab
  refetches and the button is already disabled). **Expect** the toast "Already voted" /
  "You've already voted on this request."

---

## 12. Error & edge states

- [ ] Visit a **bogus URL** (e.g. `/does-not-exist`) → "// 404", "We couldn't find that
  page." and a "Back to home" link (a full reload to `/`). No navbar or footer here by design.
  The console line from §0 is expected.
- [ ] **Route-level failure**: DevTools → Network → Offline, then navigate to a page you have
  **not** opened yet in this tab (its code chunk is not loaded). **Expect** "This page failed to
  load." with a "Try again" button, not a white screen. Go back online and use browser Back:
  the previous page renders again. A reload fully recovers the failed page.
- [ ] FAILED analysis → "Analysis Failed" (or "Rate Limit Exceeded") with the reason and "Try
  Again". On live, the rate-limit variant shows "💡 Tips to avoid rate limits:" with only
  "Wait 2-3 minutes before trying again"; the "Change Model" button and model-selector advice
  appear only in dev builds. FAILED is hard to force from the UI: garbage text is usually
  analysed anyway. A file with almost no readable text is the most reliable trigger.
- [ ] Mid-session network blip (DevTools → Network → Offline briefly, then back) → the app
  recovers; queries retry; no permanent broken state.
- [ ] **Dead session**: while signed in, open DevTools → Application → Local Storage, delete
  `refresh_token` and corrupt `access_token`. Then:
  - on `/dashboard` or `/compare`, the next request redirects to `/login?returnUrl=…`;
  - on any other page, the navbar flips to "Log in" / "Sign up" and the action continues as a
    guest.

  The downgrade must be **visible**. A signed-in UI quietly doing guest work is a failure.

---

## 13. Accessibility spot-check

- [ ] **Keyboard only** (no mouse): Tab through the landing page and one full flow. Every
  interactive element is reachable, focus is **visible**, Enter/Space activate buttons, Escape
  closes dialogs.
- [ ] Headings are a sensible order (one h1 per page, including the FAILED processing view).
- [ ] The upload form fields are labelled: clicking "Role / Title \*" focuses its input.
- [ ] Images/icons that carry meaning have labels; decorative ones don't announce noise.
- [ ] Color contrast looks adequate (text readable on its background).

> Full WCAG compliance needs real assistive-tech testing and expert review — this spot-check
> catches the obvious breakages, not everything.

---

## 14. Cross-cutting final sweep

- [ ] Re-scan the **Console** for the whole session: no red errors other than the expected
  ones in §0.
- [ ] No request **poll-storms** in Network (steady traffic, not a flood of repeats).
- [ ] Every page rendered at least once at desktop **and** a few at mobile width.
- [ ] Reduced-motion pass (§2c) done.
- [ ] Honest-labelling held everywhere a number was modelled (§5c, §10).

---

## Known issues / product decisions pending

These are known and waiting on a product decision. Note them if you see them, but they are not
new regressions.

- **"Verified" badge next to an estimate.** The confidence badge shows "Verified", "Check
  this" or "Unverified" and can sit next to "Estimated Take-Home". It describes how confidently
  the inputs were read, not the estimate itself.
- **Share links are owner-only.** "Share" copies the URL, but anyone other than the owner gets
  "This analysis isn't ready or isn't available" (§4c).
- **Account export and delete have no UI.** The backend has account export
  (`GET /account/export`) and account delete (`DELETE /users/me`), and offer delete
  (`DELETE /offers/:id`), but no screen exposes them. They cannot be UI-tested.

---

## Automated tests

`frontend/e2e/` has three Playwright runs. Install the browser once: `cd frontend`, then
`npx playwright install chromium`.

| Command | What it runs | Needs |
|---------|--------------|-------|
| `npm run test:e2e` | `e2e/suite/`: everything below, on the real stack with mock AI | Docker. It starts its own containers, API, workers and frontend |
| `npm run test:e2e:real` | `e2e/smoke.spec.ts`: signup → analyze → four drawers → compare with real AI | The dev stack running (`docs/LOCAL_DEVELOPMENT.md` §6) and an AI key |
| `npm run test:e2e:live` | `e2e/live.spec.ts`: public pages load on the live site, read-only | Network |

**Do not point `test:e2e:real` at live.** With `E2E_BASE_URL` set to the live site, the spec signs
up a real `e2e-<timestamp>@example.com` account and runs two real analyses plus negotiation and
career calls on production, and its rate-limit flush cannot reach live's Redis.

### What `test:e2e` covers, and what is still yours

| Guide section | Automated | Still manual |
|---------------|-----------|--------------|
| §1 First load | Styled render, console errors on every test | Deployed asset hash |
| §2 Motion | No blank frame or skeleton on navigation, reduced-motion hero | Whether it feels calm, scroll reveals |
| §3–§4 Landing, guests | All of it, including claiming guest offers | Visual check |
| §5 Upload, processing, results | All of it, with failure states stubbed | Real OCR, real AI quality, 5-minute wait in real time |
| §6 Drawers | All of it, on mock AI | Real AI output |
| §7 Auth | All but Google, plus token refresh, tab sync, Back after logout, hostile `returnUrl` | The Google flow on live |
| §8–§11 | All of it. Long lists and limits use stubbed responses | Visual check, chart readability |
| §12 Errors | All of it, plus invalid offer and forum links | |
| §13 Accessibility | Axe scan, one h1, labels, focus ring, dialog focus | Screen reader, full keyboard pass |

The suite fails any test that logs a console error not listed in §0. A test marked `test.fail()`
pins a known defect: it starts failing when the defect is fixed, which is the cue to delete the mark.

When you add a flow to this guide that matters for regressions, add it to `frontend/e2e/suite/` too.
