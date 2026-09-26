/**
 * M2 — auth, guest migration, and the registered-user features.
 *
 *   node test-m2.mjs
 *
 * Rewritten for cookie-based guest identity (ADR-001). The previous version sent an
 * `x-fingerprint` header and kept no cookies, so every request looked like a new guest.
 *
 * It also uploaded plain text inside a Blob labelled `application/pdf`, which routed the
 * offer to Cloud Vision, failed OCR, and left it FAILED — so negotiation, benefits and
 * corrections all reported OFFER_NOT_READY and were recorded as product bugs. They were
 * fixture bugs. This version uploads real text and waits for the analysis, so those
 * features are genuinely exercised.
 */
import { makeClient, reporter, checkDependencies, uniqueOfferText } from './test-client.mjs';

const r = reporter('M2: auth, migration, and registered-user features');

r.section('0. Dependencies');
if (!(await checkDependencies(r))) r.finish();

const guest = makeClient('guest-then-user');

const health = await guest.req('GET', '/health');
if (health.status === 200) r.ok('API reachable');
else { r.no(`API unreachable (${health.status})`); r.finish(); }

// ── guest upload ───────────────────────────────────────────────────────
r.section('1. Guest upload before signup');

const guestUpload = await guest.upload({
    text: uniqueOfferText(),
    role: 'Senior Software Engineer',
    city: 'Bangalore',
    experienceLevel: 'Senior (5-8 yrs)',
    currentCtc: 1800000,
});
if (guestUpload.status !== 201) {
    r.no(`guest upload failed (${guestUpload.status}) ${JSON.stringify(guestUpload.body).slice(0, 200)}`);
    r.finish();
}
const guestOfferId = guestUpload.body.data.id;
r.ok(`guest offer created (${guestOfferId})`);

const guestRead = await guest.req('GET', `/offers/${guestOfferId}`);
if (guestRead.status === 200 && guestRead.body.data.isGuest === true) r.ok('offer is marked as a guest offer and is readable by its owner');
else r.no(`guest read-back failed (${guestRead.status}) isGuest=${guestRead.body?.data?.isGuest}`);

// ── pipeline ───────────────────────────────────────────────────────────
r.section('2. Analysis pipeline');

const settled = await guest.waitForAnalysis(guestOfferId);
if (settled.status === 'COMPLETED') {
    r.ok(`analysis COMPLETED in ~${settled.waited / 1000}s`);
} else {
    r.no(`analysis ${settled.status}${settled.failureReason ? ` — ${settled.failureReason}` : ''}`);
    r.info('The features below need a COMPLETED analysis; expect knock-on failures.');
}

const analysis = await guest.req('GET', `/offers/${guestOfferId}/analysis`);
if (analysis.status === 200) {
    const d = analysis.body.data;
    r.ok(`analysis readable — score ${d.score}, label "${d.scoreLabel}"`);
    if (typeof d.score === 'number') r.ok('score is present and numeric (was never returned before -1B)');
    else r.no(`score missing or non-numeric: ${JSON.stringify(d.score)}`);

    // aiMetadata now carries token counts and an estimated USD cost per call. That is
    // margin information, and the route used to return aiMetadata wholesale. Asserted
    // end-to-end because the guard is a hand-picked field list in analysis.service.ts,
    // and the tempting one-line "fix" is to go back to spreading the stored object.
    if (d.metadata && 'usage' in d.metadata) {
        r.no(`token usage and cost leaked to the client: ${JSON.stringify(d.metadata.usage)}`);
    } else {
        r.ok('token usage and cost are NOT exposed to the client');
    }
} else {
    r.no(`analysis not readable (${analysis.status})`);
}

// ── signup + migration ─────────────────────────────────────────────────
r.section('3. Signup and guest-offer migration');

const email = `m2-${Date.now()}@example.com`;
const signup = await guest.req('POST', '/auth/signup', {
    name: 'M2 Tester',
    email,
    password: 'CorrectHorse9!',
    offerIds: [guestOfferId],
});
if (signup.status !== 201) {
    r.no(`signup failed (${signup.status}) ${JSON.stringify(signup.body).slice(0, 200)}`);
    r.finish();
}
const token = signup.body.data.tokens.accessToken;
const userId = signup.body.data.user.id;
r.ok(`registered (${userId})`);

const history = await guest.req('GET', '/users/me/offers', null, token);
if (history.status === 200) {
    const offers = history.body.data.offers ?? history.body.data;
    if (Array.isArray(offers) && offers.some((o) => o.id === guestOfferId)) r.ok('guest offer migrated into the account');
    else r.no(`migrated offer not in history: ${JSON.stringify(history.body.data).slice(0, 200)}`);
} else {
    r.no(`history failed (${history.status})`);
}

// ── registered-user features ───────────────────────────────────────────
r.section('4. Registered-user features on the analysed offer');

const neg = await guest.req('POST', `/offers/${guestOfferId}/negotiate`, { tone: 'professional' }, token);
if (neg.status === 200) {
    r.ok('negotiation script generated');
    r.info(`subject: ${String(neg.body.data?.subject ?? '').slice(0, 70)}`);
} else r.no(`negotiation (${neg.status}) ${JSON.stringify(neg.body).slice(0, 160)}`);

const bens = await guest.req('POST', `/offers/${guestOfferId}/benefits`, {}, token);
if (bens.status === 200) r.ok(`benefits calculated (${bens.body.data?.breakdown?.length ?? 0} entries)`);
else r.no(`benefits (${bens.status}) ${JSON.stringify(bens.body).slice(0, 160)}`);

const career = await guest.req('GET', `/offers/${guestOfferId}/career-path`, null, token);
if (career.status === 200) r.ok(`career path generated (${career.body.data?.timeline?.length ?? 0} milestones)`);
else if (career.body?.error?.message?.includes('Role not identified')) {
    r.known('career path rejects the offer: "Role not identified"', 'Phase 1 tasks 3-5 — pipeline discards extraction');
} else r.no(`career path (${career.status}) ${JSON.stringify(career.body).slice(0, 160)}`);

const corr = await guest.req('PATCH', `/offers/${guestOfferId}/corrections`, {
    corrections: [{ field: 'extractedData.role', correctedValue: 'Staff Software Engineer' }],
}, token);
if (corr.status === 200) r.ok(`corrections applied (changed=${corr.body.data?.changed})`);
else r.no(`corrections (${corr.status}) ${JSON.stringify(corr.body).slice(0, 160)}`);

const getCorr = await guest.req('GET', `/offers/${guestOfferId}/corrections`, null, token);
if (getCorr.status === 200 && Array.isArray(getCorr.body.data)) r.ok(`corrections readable (${getCorr.body.data.length})`);
else r.no(`get corrections (${getCorr.status})`);

const report = await guest.req('GET', `/offers/${guestOfferId}/report`, null, token);
if (report.status === 200) r.ok('PDF report generated');
else r.no(`PDF report (${report.status})`);

// ── comparison ─────────────────────────────────────────────────────────
// Previously skipped entirely with a console.log, so comparison has never been tested.
r.section('5. Offer comparison');

const second = await guest.upload({
    text: uniqueOfferText(),
    role: 'Senior Software Engineer',
    city: 'Pune',
    experienceLevel: 'Senior (5-8 yrs)',
}, token);

if (second.status !== 201) {
    r.no(`second upload failed (${second.status}) — cannot test comparison`);
} else {
    const secondId = second.body.data.id;
    r.ok(`second offer created (${secondId})`);

    const tooFew = await guest.req('POST', '/offers/compare', { offerIds: [guestOfferId] }, token);
    if (tooFew.status === 400) r.ok('comparing a single offer is rejected (400)');
    else r.no(`single-offer comparison returned ${tooFew.status}, expected 400`);

    const s2 = await guest.waitForAnalysis(secondId, token);
    if (s2.status !== 'COMPLETED') {
        r.no(`second analysis ${s2.status} — comparison needs both COMPLETED`);
    } else {
        r.ok('second analysis COMPLETED');
        const cmp = await guest.req('POST', '/offers/compare', { offerIds: [guestOfferId, secondId] }, token);

        // This used to read `data.entries`, a key the service has never returned, so it
        // printed "? entries" and passed on the status code alone. That blindness is why the
        // response and ComparePage were free to drift apart until the page crashed on every
        // comparison: nothing asserted the shape the page actually consumes.
        if (cmp.status === 200) {
            const d = cmp.body.data;
            r.ok(`comparison returned ${d?.offers?.length ?? 0} offers and ${d?.rows?.length ?? 0} rows`);

            if (Array.isArray(d?.rows) && d.rows.length > 0) r.ok('rows[] is present (ComparePage renders this)');
            else r.no('rows[] missing — the comparison table renders empty without it');

            if (d?.offers?.every((o) => typeof o.id === 'string' && 'company' in o)) {
                r.ok('offers[] uses id/company, the keys the page reads');
            } else {
                r.no(`offers[] shape wrong: ${JSON.stringify(d?.offers?.[0]).slice(0, 160)}`);
            }

            const metrics = (d?.rows ?? []).map((row) => row.metric);
            if (new Set(metrics).size === metrics.length) r.ok('row metrics are unique (they are React keys)');
            else r.no(`duplicate row metric: ${metrics.join(', ')}`);

            if (d?.rows?.every((row) => Array.isArray(row.values) && row.values.length === d.offers.length)) {
                r.ok('every row has one value per offer');
            } else {
                r.no('a row has the wrong number of values for the offer count');
            }

            // The bug that killed the page: recommendation was an object rendered straight into
            // a paragraph. It stays an object, so the assertion is that the page reads fields.
            if (typeof d?.recommendation?.reason === 'string' && typeof d?.recommendation?.caveat === 'string') {
                r.ok('recommendation exposes reason and caveat as strings');
            } else {
                r.no(`recommendation shape wrong: ${JSON.stringify(d?.recommendation).slice(0, 160)}`);
            }

            if (d?.basis && Array.isArray(d.basis.components)) r.ok(`compared on ${d.basis.components.length} shared component(s)`);
            else r.no('basis missing — no way to tell what the comparison was computed on');
        }
        else r.no(`comparison (${cmp.status}) ${JSON.stringify(cmp.body).slice(0, 200)}`);
    }
}

// ── dashboard, profile, deletion ───────────────────────────────────────
r.section('6. Dashboard, profile, account deletion');

const dash = await guest.req('GET', '/users/me/dashboard', null, token);
if (dash.status === 200) {
    r.ok('dashboard stats returned');
    r.info(JSON.stringify(dash.body.data));
} else r.no(`dashboard (${dash.status})`);

const me = await guest.req('GET', '/users/me', null, token);
if (me.status === 200 && me.body.data.email === email) r.ok(`profile returned (${me.body.data.email})`);
else r.no(`profile (${me.status})`);

const del = await guest.req('DELETE', '/users/me', null, token);
if (del.status === 200) r.ok('account deleted');
else r.no(`account deletion (${del.status})`);

const after = await guest.req('GET', '/users/me', null, token);
if (after.status === 401 || after.status === 404) r.ok(`token rejected after deletion (${after.status})`);
else r.no(`account still reachable after deletion (${after.status})`);

r.finish();
