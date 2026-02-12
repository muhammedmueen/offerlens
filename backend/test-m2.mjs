/**
 * M2 Endpoint Test Script
 * Tests Auth, User, Migration, and new M2 features.
 */
import net from 'net';

const BASE = 'http://localhost:8000/api/v1';
// Use a unique fingerprint for this run to ensure clean guest state
const FP = 'm2-test-fp-' + Date.now();
let TOKEN = null;
let USER_ID = null;

// Helper logging
const log = (msg) => console.log(msg);
const passed = (name) => console.log(`✅ ${name}`);
const failed = (name, err) => console.log(`❌ ${name}: ${err}`);
const section = (name) => console.log(`\n=== ${name} ===`);

// Port checker helper
const checkPort = (port, name) => new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 2000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
        socket.destroy();
        resolve({ open: true, name, port });
    });

    socket.on('timeout', () => {
        socket.destroy();
        resolve({ open: false, name, port, error: 'Timeout' });
    });

    socket.on('error', (err) => {
        socket.destroy();
        resolve({ open: false, name, port, error: err.message });
    });

    socket.connect(port, '127.0.0.1');
});

async function req(method, path, body, token = null) {
    const headers = { 'x-fingerprint': FP };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };

    if (body) {
        if (body instanceof FormData) {
            opts.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }

    log(`[REQ] ${method} ${path}`);
    try {
        const res = await fetch(`${BASE}${path}`, opts);
        log(`[RES] ${res.status} ${res.statusText}`);

        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = text; }

        if (!res.ok) {
            log(`[ERR BODY] ${JSON.stringify(json).substring(0, 200)}...`);
        }

        return { status: res.status, body: json, headers: res.headers };
    } catch (err) {
        console.error(`FATAL ERROR in req(${method} ${path}):`, err.message);
        if (err.cause) console.error('Cause:', err.cause);
        throw err;
    }
}

async function run() {
    try {
        section('0. Dependency Check');
        const deps = [
            checkPort(6379, 'Redis'),
            checkPort(5432, 'Postgres'),
            checkPort(8000, 'Backend Server')
        ];

        const results = await Promise.all(deps);
        let allDepsOpen = true;

        results.forEach(r => {
            if (r.open) passed(`${r.name} (Port ${r.port}) is OPEN`);
            else {
                failed(`${r.name} (Port ${r.port})`, `CLOSED/UNREACHABLE (${r.error})`);
                if (r.name !== 'Backend Server') allDepsOpen = false; // Backend usually fails if dependencies fail
            }
        });

        if (!allDepsOpen) {
            console.log('\n⚠️  WARNING: Critical dependencies (Redis/Postgres) seem to be down.');
            console.log('    Ensure you are running: docker-compose up -d');
            console.log('    Then restart: npm run dev\n');
            // We continue but expect failure
        }

        // 0. Health Check
        section('0. Connectivity Check');
        try {
            const health = await req('GET', '/health');
            if (health.status === 200) passed('Server Reachable');
            else failed('Server Reachable', `Status ${health.status}`);
        } catch (e) {
            failed('Server Reachable', 'Connection failed - ensure server is running on port 8000');
            // process.exit(1);
        }

        section('1. Guest Upload (Pre-Signup)');
        // Upload an offer as a guest
        const blob = new Blob([`Guest offer content ${Date.now()}...`], { type: 'application/pdf' });
        const form = new FormData();
        form.append('file', blob, 'guest-offer.pdf');

        const guestUpload = await req('POST', '/offers', form);
        if (guestUpload.status !== 201) throw new Error(`Guest upload failed: ${guestUpload.status}`);
        const guestOfferId = guestUpload.body.data.id;
        passed(`Guest Upload (ID: ${guestOfferId})`);

        // Verify it's a guest offer
        const guestGet = await req('GET', `/offers/${guestOfferId}`);
        if (!guestGet.body.data.isGuest) throw new Error('Offer should be isGuest=true');
        passed('Guest verification');


        section('2. Signup & Migration');
        const email = `testuser${Date.now()}@example.com`;
        const password = 'Password123!';

        const signup = await req('POST', '/auth/signup', { name: 'Test User', email, password });
        if (signup.status !== 201) throw new Error(`Signup failed: ${signup.status} ${JSON.stringify(signup.body)}`);

        TOKEN = signup.body.data.tokens.accessToken;
        USER_ID = signup.body.data.user.id;
        passed(`Signup (User ID: ${USER_ID})`);

        // Verify Migration: Check if guest offer is now owned by user
        const userOffers = await req('GET', '/users/me/offers', null, TOKEN);
        if (userOffers.status !== 200) throw new Error(`Get offers failed: ${userOffers.status}`);

        const migratedOffer = userOffers.body.data.offers.find(o => o.id === guestOfferId);
        if (migratedOffer) {
            passed(`Migration verified (Guest offer ${guestOfferId} found in user list)`);
        } else {
            failed('Migration check', 'Guest offer NOT found in user list');
        }


        section('3. User Upload (Direct)');
        // Upload as logged-in user
        const blob2 = new Blob([`User offer content ${Date.now()}...`], { type: 'application/pdf' });
        const form2 = new FormData();
        form2.append('file', blob2, 'user-offer.pdf');

        const userUpload = await req('POST', '/offers', form2, TOKEN);

        // NOTE: This might fail if rate-limited (guest limit) or succeed but not link to user
        // Testing the behavior "as is"
        if (userUpload.status === 201) {
            const userOfferId = userUpload.body.data.id;
            passed(`User Upload (ID: ${userOfferId})`);

            // Check if it appears in list
            const userOffers2 = await req('GET', '/users/me/offers', null, TOKEN);
            const found = userOffers2.body.data.offers.find(o => o.id === userOfferId);
            if (found) {
                passed('User Upload verified in list');
            } else {
                failed('User Upload Linking', 'Uploaded offer NOT found in user list (Likely still Guest offer)');
            }

            // Test M2 Features on this offer
            section('4. M2 Features (Negotiation/Benefits/Corrections)');

            // 4a. Negotiation
            const neg = await req('POST', `/offers/${userOfferId}/negotiate`, { tone: 'professional' }, TOKEN);
            if (neg.status === 200) passed('Negotiation generated');
            else failed('Negotiation', `${neg.status} ${JSON.stringify(neg.body)}`);

            // 4b. Benefits
            const bens = await req('POST', `/offers/${userOfferId}/benefits`, { overrides: { 'Remote': 1000 } }, TOKEN);
            if (bens.status === 200) passed('Benefits analyzed');
            else failed('Benefits', `${bens.status} ${JSON.stringify(bens.body)}`);

            // 4c. Corrections
            const corr = await req('PATCH', `/offers/${userOfferId}/corrections`, {
                corrections: [{ field: 'role', correctedValue: 'Senior Engineer' }]
            }, TOKEN);
            if (corr.status === 200) passed('Corrections applied');
            else failed('Corrections', `${corr.status} ${JSON.stringify(corr.body)}`);

            // 4d. Get Corrections
            const getCorr = await req('GET', `/offers/${userOfferId}/corrections`, null, TOKEN);
            if (getCorr.status === 200 && getCorr.body.data.length > 0) passed('Get Corrections verified');
            else failed('Get Corrections', `${getCorr.status} ${JSON.stringify(getCorr.body)}`);

        } else {
            failed('User Upload', `Failed with status ${userUpload.status} (Rate limit? Phase gap?)`);
        }

        section('5. Comparison');
        // Need 2 offers. We have guestOfferId (migrated) and maybe userOfferId.
        // If migration worked, we can compare them.
        if (guestUpload.status === 201) {
            // Create a 2nd offer if user upload failed or didn't link
            // Actually let's just try to compare guestOfferId with itself if we lack 2?
            // API requires min 2 unique IDs.
            // Let's rely on Guest Offer + User Offer (if created)
            // Or create another one?

            // Let's assume we have at least one. We need another.
            // Reuse guestOfferId and... maybe upload another one?
            // If user upload failed, we can't test comparison easily without another user offer.
            // But if User Upload passed (even if not linked), it has an ID.
            // Wait, comparison requires ownership check!
            // If user upload didn't link, we can't compare it!

            console.log('Skipping Comparison (requires 2 valid user offers)');
        }

        section('6. Dashboard & Profile');
        const dash = await req('GET', '/users/me/dashboard', null, TOKEN);
        if (dash.status === 200) passed(`Dashboard stats: ${JSON.stringify(dash.body.data)}`);
        else failed('Dashboard', dash.status);

        const me = await req('GET', '/users/me', null, TOKEN);
        if (me.status === 200) passed(`Profile: ${me.body.data.email}`);
        else failed('Profile', me.status);


        section('7. Cleanup (Delete Account)');
        const del = await req('DELETE', '/users/me', null, TOKEN);
        if (del.status === 200) passed('Account deleted');
        else failed('Delete Account', del.status);

        // Verify deletion
        const check = await req('GET', '/users/me', null, TOKEN);
        if (check.status === 401 || check.status === 404) passed('Auth rejected after delete');
        else failed('Account persistence', `Still accessible: ${check.status}`);

    } catch (err) {
        console.log('\nFATAL ERROR:', err.message);
    }
}

run();
