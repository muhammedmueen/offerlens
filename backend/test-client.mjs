/**
 * Shared harness for the integration scripts (test-security / test-m2 / test-m3).
 *
 * Exists because all three had their own copy of a request helper, and all three sent an
 * `x-fingerprint` header that no longer means anything. Guest identity is now a signed
 * httpOnly cookie (ADR-001), so a client that does not keep cookies looks like a brand
 * new visitor on every request — which breaks guest read-back, migration, and any
 * per-guest limit.
 */
import net from 'net';

export const BASE = process.env.OFFERLENS_API ?? 'http://localhost:8000/api/v1';

/**
 * One browser: its own cookie jar, so its guest identity persists across requests.
 */
export function makeClient(label = 'client') {
    const jar = new Map();

    const absorb = (res) => {
        for (const raw of res.headers.getSetCookie?.() ?? []) {
            const [pair] = raw.split(';');
            const i = pair.indexOf('=');
            if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
    };

    const parse = async (res) => {
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    };

    return {
        label,

        cookieHeader() {
            return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
        },

        /** JSON (or FormData) request. Pass a token to authenticate as a user. */
        async req(method, path, body, token = null) {
            const headers = {};
            const cookie = this.cookieHeader();
            if (cookie) headers['Cookie'] = cookie;
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const opts = { method, headers };
            if (body instanceof FormData) {
                opts.body = body;
            } else if (body !== undefined && body !== null) {
                headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }

            const res = await fetch(`${BASE}${path}`, opts);
            absorb(res);
            return { status: res.status, body: await parse(res) };
        },

        /**
         * Upload offer text.
         *
         * `POST /offers` is multipart-only — the route walks req.body for
         * { type: 'file' | 'field' } objects, so a JSON body yields a misleading
         * "File or text is required" 400.
         *
         * Sends the offer as a text FIELD rather than a fake PDF Blob. The previous
         * scripts attached plain text with `type: 'application/pdf'`, which routed it to
         * Cloud Vision, failed OCR, and left the offer stuck at FAILED — which is why
         * every feature needing a COMPLETED analysis reported OFFER_NOT_READY.
         */
        async upload(fields, token = null) {
            const form = new FormData();
            for (const [k, v] of Object.entries(fields)) {
                if (v !== undefined && v !== null) form.append(k, String(v));
            }
            return this.req('POST', '/offers', form, token);
        },

        /** Poll an offer until the pipeline settles. Returns the final status. */
        async waitForAnalysis(offerId, token = null, timeoutMs = 120000) {
            let waited = 0;
            while (waited < timeoutMs) {
                const res = await this.req('GET', `/offers/${offerId}`, null, token);
                const status = res.body?.data?.status;
                if (status === 'COMPLETED' || status === 'FAILED') {
                    return { status, failureReason: res.body?.data?.failureReason ?? null, waited };
                }
                await new Promise((r) => setTimeout(r, 3000));
                waited += 3000;
            }
            return { status: 'TIMEOUT', failureReason: null, waited };
        },
    };
}

/** Consistent pass/fail counting, and a non-zero exit so these can gate a build. */
export function reporter(title) {
    let pass = 0;
    let fail = 0;
    const failures = [];
    const known = [];

    console.log(`\n${title}\n${'='.repeat(title.length)}`);

    return {
        ok(msg) {
            console.log(`  PASS  ${msg}`);
            pass++;
        },
        no(msg) {
            console.log(`  FAIL  ${msg}`);
            fail++;
            failures.push(msg);
        },
        /**
         * A failure we already understand and have planned work for.
         *
         * Kept out of the exit code deliberately: a suite that is permanently red gets
         * ignored, and then a genuinely new regression hides in the noise. These are
         * listed prominently in the summary instead, and should be converted to `ok`
         * assertions once the blocking work lands.
         */
        known(msg, blockedBy) {
            console.log(`  KNOWN ${msg}`);
            console.log(`        blocked by: ${blockedBy}`);
            known.push(`${msg}  [${blockedBy}]`);
        },
        section(msg) {
            console.log(`\n--- ${msg} ---`);
        },
        info(msg) {
            console.log(`        ${msg}`);
        },
        /** Call last. Exits non-zero only on unexpected failures. */
        finish() {
            console.log(`\n${'='.repeat(52)}`);
            console.log(`  ${pass} passed, ${fail} failed, ${known.length} known-blocked`);
            if (failures.length) {
                console.log('\n  Failures:');
                for (const f of failures) console.log(`    - ${f}`);
            }
            if (known.length) {
                console.log('\n  Known, already planned:');
                for (const k of known) console.log(`    - ${k}`);
            }
            console.log('='.repeat(52));
            process.exit(fail > 0 ? 1 : 0);
        },
    };
}

const checkPort = (port, name) =>
    new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.destroy(); resolve({ open: true, name, port }); });
        socket.on('timeout', () => { socket.destroy(); resolve({ open: false, name, port, error: 'timeout' }); });
        socket.on('error', (e) => { socket.destroy(); resolve({ open: false, name, port, error: e.message }); });
        socket.connect(port, '127.0.0.1');
    });

/** Verifies Redis, Postgres and the API are listening. Returns true if all are up. */
export async function checkDependencies(r) {
    const results = await Promise.all([
        checkPort(6379, 'Redis'),
        checkPort(5432, 'Postgres'),
        checkPort(8000, 'API'),
    ]);
    let allUp = true;
    for (const res of results) {
        if (res.open) r.ok(`${res.name} listening on ${res.port}`);
        else { r.no(`${res.name} unreachable on ${res.port} (${res.error})`); allUp = false; }
    }
    if (!allUp) {
        r.info('Start dependencies with: docker compose up -d   then: npm run dev / npm run workers');
    }
    return allUp;
}

/** A realistic offer letter with several genuine red flags, for pipeline exercise. */
export const SAMPLE_OFFER_TEXT = `
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

/** Unique text per run so owner-scoped dedup doesn't return a previous run's offer. */
export const uniqueOfferText = () => `${SAMPLE_OFFER_TEXT}\n\nReference: ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
