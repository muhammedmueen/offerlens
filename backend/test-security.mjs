/**
 * Runtime verification for Phase -1A (ADR-001).
 *
 * Every assertion here corresponds to a defect that was previously only reasoned
 * about. Requires the API on :8000 with Postgres and Redis up.
 *
 *   node test-security.mjs
 */

const BASE = 'http://localhost:8000/api/v1';

let pass = 0;
let fail = 0;

const ok = (m) => { console.log(`  PASS  ${m}`); pass++; };
const no = (m) => { console.log(`  FAIL  ${m}`); fail++; };
const section = (m) => console.log(`\n=== ${m} ===`);

/**
 * A browser. Holds its own cookie jar, which is the entire point — the old scripts
 * sent an x-fingerprint header and kept no cookies, so every request looked like a
 * brand-new visitor.
 */
function makeClient(label) {
    const jar = new Map();
    return {
        label,
        cookies: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
        async req(method, path, body, token) {
            const headers = {};
            const cookie = this.cookies();
            if (cookie) headers['Cookie'] = cookie;
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (body) headers['Content-Type'] = 'application/json';

            const res = await fetch(`${BASE}${path}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });

            for (const raw of res.headers.getSetCookie?.() ?? []) {
                const [pair] = raw.split(';');
                const idx = pair.indexOf('=');
                jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
            }

            let parsed = null;
            const text = await res.text();
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            return { status: res.status, body: parsed };
        },

        /**
         * POST /offers accepts multipart only — the route walks req.body looking for
         * fields shaped { type: 'file' | 'field' }, which @fastify/multipart produces.
         * A JSON body yields a misleading "File or text is required" 400.
         */
        async upload(fields, token) {
            const form = new FormData();
            for (const [k, v] of Object.entries(fields)) {
                if (v !== undefined && v !== null) form.append(k, String(v));
            }
            const headers = {};
            const cookie = this.cookies();
            if (cookie) headers['Cookie'] = cookie;
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${BASE}/offers`, { method: 'POST', headers, body: form });

            for (const raw of res.headers.getSetCookie?.() ?? []) {
                const [pair] = raw.split(';');
                const idx = pair.indexOf('=');
                jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
            }

            let parsed = null;
            const text = await res.text();
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            return { status: res.status, body: parsed };
        },
    };
}

const OFFER_TEXT = `
OFFER OF EMPLOYMENT

Dear Candidate,

We are pleased to offer you the position of Senior Software Engineer at Acme Technologies
Private Limited, based in Bangalore. Your annual CTC will be INR 24,00,000 comprising a
basic salary of INR 12,00,000, a performance bonus of up to INR 3,00,000, and employer
provident fund contributions as per statute.

Benefits include group health insurance with coverage of INR 5,00,000, 18 days of paid
leave annually, and a learning allowance of INR 25,000 per year.

You will serve a probation period of six months. During probation, employment may be
terminated without notice. You are required to serve a notice period of 90 days upon
resignation. You agree not to engage in any competing business for 12 months following
separation. All intellectual property created during your employment shall be assigned
to the company.

Your expected date of joining is 1 December 2026.
`.trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    // ── connectivity ───────────────────────────────────────────────────
    section('0. Connectivity');
    const probe = makeClient('probe');
    const health = await probe.req('GET', '/health');
    if (health.status === 200) ok('server reachable'); else { no(`server unreachable (${health.status})`); return; }

    // ── A1: cookie identity ────────────────────────────────────────────
    section('1. A1 — guest identity is a server-issued cookie');
    const guestA = makeClient('guestA');
    await guestA.req('GET', '/health');
    const firstCookie = guestA.cookies();
    if (/ol_guest=/.test(firstCookie)) ok('ol_guest cookie issued on first request');
    else no(`no ol_guest cookie issued (got: ${firstCookie || 'nothing'})`);

    await guestA.req('GET', '/health');
    if (guestA.cookies() === firstCookie) ok('same cookie reused on subsequent request');
    else no('cookie changed between requests — identity is not stable');

    const guestB = makeClient('guestB');
    await guestB.req('GET', '/health');
    if (guestB.cookies() && guestB.cookies() !== firstCookie) ok('a second browser gets a DIFFERENT identity');
    else no('second browser got the same identity — the original bug');

    // ── upload ─────────────────────────────────────────────────────────
    section('2. Guest upload');
    const created = await guestA.upload({
        text: OFFER_TEXT, role: 'Senior Software Engineer', city: 'Bangalore',
        experienceLevel: 'Senior (5-8 yrs)', currentCtc: 1800000,
    });
    if (created.status !== 201) { no(`upload failed (${created.status}) ${JSON.stringify(created.body).slice(0, 300)}`); return; }
    const offerId = created.body.data.id;
    ok(`offer created ${offerId}`);

    // ── A2: read authorization ─────────────────────────────────────────
    section('3. A2 — offer read authorization');
    const ownerRead = await guestA.req('GET', `/offers/${offerId}`);
    if (ownerRead.status === 200) ok('owning guest CAN read its own offer');
    else no(`owning guest blocked from its own offer (${ownerRead.status})`);

    const strangerRead = await guestB.req('GET', `/offers/${offerId}`);
    if (strangerRead.status === 404) ok('different guest CANNOT read it (404)');
    else no(`*** different guest read another guest's offer (${strangerRead.status}) ***`);

    const anonRead = await fetch(`${BASE}/offers/${offerId}`).then((r) => r.status);
    if (anonRead === 404) ok('caller with no cookie at all CANNOT read it (404)');
    else no(`*** cookieless caller read the offer (${anonRead}) ***`);

    // ── A3: dedup scoping ──────────────────────────────────────────────
    section('4. A3 — duplicate text is scoped per owner');
    const dup = await guestB.upload({
        text: OFFER_TEXT, role: 'Senior Software Engineer', city: 'Bangalore',
        experienceLevel: 'Senior (5-8 yrs)',
    });
    if (dup.status === 201 && dup.body.data.id !== offerId) ok(`identical text from another guest got its OWN offer (${dup.body.data.id})`);
    else if (dup.body?.data?.id === offerId) no("*** identical text returned the other guest's offer id ***");
    else no(`duplicate upload failed (${dup.status}) ${JSON.stringify(dup.body).slice(0, 200)}`);

    // ── pipeline ───────────────────────────────────────────────────────
    section('5. Analysis pipeline (real Gemini)');
    let status = null;
    let waited = 0;
    while (waited < 120000) {
        const poll = await guestA.req('GET', `/offers/${offerId}`);
        status = poll.body?.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') break;
        await sleep(3000);
        waited += 3000;
    }
    if (status === 'COMPLETED') {
        ok(`analysis COMPLETED in ~${waited / 1000}s`);
        const an = await guestA.req('GET', `/offers/${offerId}/analysis`);
        if (an.status === 200) {
            const d = an.body.data;
            ok(`analysis readable — score ${d.score ?? 'n/a'}, ${d.redFlags?.length ?? 0} red flags, ${d.benefits?.length ?? 0} benefits`);
            console.log(`        company: ${d.extractedData?.companyName ?? '?'} | role: ${d.extractedData?.role ?? '?'}`);
            console.log(`        salary dataSource: ${d.salaryComparison?.dataSource ?? '?'}`);
            console.log(`        model: ${d.metadata?.modelUsed ?? '?'}`);
        } else no(`owner could not read analysis (${an.status})`);

        const anStranger = await guestB.req('GET', `/offers/${offerId}/analysis`);
        if (anStranger.status === 404) ok('different guest CANNOT read the analysis (404)');
        else no(`*** different guest read the analysis (${anStranger.status}) ***`);

        const rpt = await guestB.req('GET', `/offers/${offerId}/report`);
        if (rpt.status === 404) ok('different guest CANNOT download the PDF report (404)');
        else no(`*** different guest downloaded the report (${rpt.status}) ***`);
    } else {
        const poll = await guestA.req('GET', `/offers/${offerId}`);
        no(`analysis did not complete — status ${status}, reason: ${poll.body?.data?.failureReason ?? 'n/a'}`);
    }

    // ── A4: migration ──────────────────────────────────────────────────
    section('6. A4 — guest offers claimed on signup');
    const emailA = `sec-a-${Date.now()}@example.com`;
    const signupA = await guestA.req('POST', '/auth/signup', {
        email: emailA, password: 'CorrectHorse9!', name: 'Guest A', offerIds: [offerId],
    });
    if (signupA.status !== 201) { no(`signup failed (${signupA.status}) ${JSON.stringify(signupA.body).slice(0, 200)}`); return; }
    const tokenA = signupA.body.data.tokens.accessToken;
    ok('user A registered');

    const mine = await guestA.req('GET', '/users/me/offers', null, tokenA);
    const found = JSON.stringify(mine.body).includes(offerId);
    if (found) ok('the guest offer was migrated into the account');
    else no(`migrated offer not found in history: ${JSON.stringify(mine.body).slice(0, 200)}`);

    const staleGuest = makeClient('staleGuestA');
    staleGuest.cookies = guestA.cookies.bind(guestA);
    const afterMigrate = await fetch(`${BASE}/offers/${offerId}`, { headers: { Cookie: guestA.cookies() } })
        .then((r) => r.status);
    if (afterMigrate === 404) ok('the old guest cookie alone can NO LONGER read the claimed offer (404)');
    else no(`*** stale guest cookie still reads a claimed offer (${afterMigrate}) ***`);

    // ── A2: delete authorization ───────────────────────────────────────
    section('7. A2 — delete authorization');
    const userB = makeClient('userB');
    await userB.req('GET', '/health');
    const signupB = await userB.req('POST', '/auth/signup', {
        email: `sec-b-${Date.now()}@example.com`, password: 'CorrectHorse9!', name: 'User B',
    });
    if (signupB.status !== 201) { no(`second signup failed (${signupB.status})`); return; }
    const tokenB = signupB.body.data.tokens.accessToken;
    ok('user B registered');

    const crossDelete = await userB.req('DELETE', `/offers/${offerId}`, null, tokenB);
    if (crossDelete.status === 404) ok("another logged-in user CANNOT delete it (404)");
    else no(`*** user B deleted user A's offer (${crossDelete.status}) ***`);

    const stillThere = await guestA.req('GET', `/offers/${offerId}`, null, tokenA);
    if (stillThere.status === 200) ok('offer still intact and readable by its owner');
    else no(`owner lost access after the cross-delete attempt (${stillThere.status})`);

    const ownDelete = await guestA.req('DELETE', `/offers/${offerId}`, null, tokenA);
    if (ownDelete.status === 200) ok('the owner CAN delete their own offer');
    else no(`owner could not delete their own offer (${ownDelete.status})`);

    console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => { console.error('\nharness error:', e); process.exit(1); });
