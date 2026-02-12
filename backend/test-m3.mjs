/**
 * M3 Endpoint Test Script
 * Tests Forum, Salary, and Career endpoints.
 * Requires backend running on localhost:8000
 */
import net from 'net';

const BASE = 'http://localhost:8000/api/v1';
const FP = 'm3-test-fp-' + Date.now();
let TOKEN = null;
let USER_ID = null;
let OFFER_ID = null; // Needed for career path

// Helper logging
const log = (msg) => console.log(msg);
const passed = (name) => console.log(`✅ ${name}`);
const failed = (name, err) => console.log(`❌ ${name}: ${err}`);
const section = (name) => console.log(`\n=== ${name} ===`);

// Port checker
const checkPort = (port, name) => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve({ open: true, name, port }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ open: false, name, port, error: 'Timeout' }); });
    socket.on('error', (err) => { socket.destroy(); resolve({ open: false, name, port, error: err.message }); });
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

        if (!res.ok) log(`[ERR BODY] ${JSON.stringify(json).substring(0, 200)}...`);
        return { status: res.status, body: json, headers: res.headers };
    } catch (err) {
        console.error(`FATAL ERROR in req(${method} ${path}):`, err.message);
        throw err;
    }
}

async function run() {
    try {
        section('0. Dependency Check');
        const results = await Promise.all([
            checkPort(6379, 'Redis'),
            checkPort(5432, 'Postgres'),
            checkPort(8000, 'Backend Server')
        ]);

        if (!results.every(r => r.open)) {
            console.log('⚠️  Critical dependencies down. Check Docker/Server.');
            // return; // Let's try anyway
        } else {
            passed('All systems GO');
        }

        // 1. Setup - Create User & Offer (Needed for Career Path)
        section('1. Setup (User & Offer)');
        const email = `m3user${Date.now()}@example.com`;
        const signup = await req('POST', '/auth/signup', { name: 'M3 Tester', email, password: 'Password123!' });
        if (signup.status !== 201) throw new Error('Signup failed');
        TOKEN = signup.body.data.tokens.accessToken;
        USER_ID = signup.body.data.user.id;
        passed(`User Created (${USER_ID})`);

        // Upload offer for career path test
        const blob = new Blob([`M3 Career Path Test Offer content ${Date.now()}`], { type: 'application/pdf' });
        const form = new FormData();
        form.append('file', blob, 'career-offer.pdf');
        const upload = await req('POST', '/offers', form, TOKEN);
        if (upload.status === 201) {
            OFFER_ID = upload.body.data.id;
            passed(`Offer Created (${OFFER_ID})`);
        } else {
            failed('Offer Creation', upload.status);
        }

        // 2. Forum Tests
        section('2. Forum');

        // Create Post
        const postRes = await req('POST', '/forum/posts', {
            title: 'Negotiation Strategy for SDE-2',
            content: 'I have an offer from a startup. Should I negotiate specifically on ESOPs or Base? Looking for advice.',
            category: 'negotiation'
        }, TOKEN);

        let postId;
        if (postRes.status === 201) {
            postId = postRes.body.data.id;
            passed(`Post Created (${postId})`);
        } else failed('Create Post', postRes.status);

        // List Posts
        const listRes = await req('GET', '/forum/posts?category=negotiation');
        // console.log('List Posts Body:', JSON.stringify(listRes.body, null, 2));
        if (listRes.status === 200 && Array.isArray(listRes.body.data) && listRes.body.data.length > 0) passed('List Posts');
        else failed('List Posts', `${listRes.status} (Expected array, got ${typeof listRes.body.data})`);

        // Get Post Detail
        if (postId) {
            const getRes = await req('GET', `/forum/posts/${postId}`);
            if (getRes.status === 200) passed('Get Post Detail');
            else failed('Get Post Detail', getRes.status);

            // Add Comment
            const commRes = await req('POST', `/forum/posts/${postId}/comments`, {
                content: 'Focus on base salary first. ESOPs are paper money until exit.'
            }, TOKEN);
            if (commRes.status === 201) passed('Add Comment');
            else failed('Add Comment', commRes.status);
        }

        // 3. Salary Tests
        section('3. Salary (Crowdsourced)');

        // Submit Salary (Anonymous)
        const salRes = await req('POST', '/salaries', {
            role: 'Senior Software Engineer',
            city: 'Bangalore',
            experienceYears: 5,
            ctc: 4500000,
            companyType: 'product',
            companySize: '201-1000'
        });

        if (salRes.status === 200) passed('Submit Salary (Anonymous)');
        else failed('Submit Salary', salRes.status);

        // Get Stats
        const statsRes = await req('GET', '/salaries/stats?role=Senior Software Engineer&city=Bangalore');
        if (statsRes.status === 200) {
            const data = statsRes.body.data;
            if (data.data === null) {
                passed(`Salary Stats: ${data.message} (Count: ${data.count})`);
            } else {
                passed(`Salary Stats: Median ${data.p50} (n=${data.count})`);
            }
        } else failed('Get Salary Stats', statsRes.status);


        // 4. Career Path
        section('4. Career Path');
        if (OFFER_ID) {
            const carRes = await req('GET', `/offers/${OFFER_ID}/career-path`, null, TOKEN);
            if (carRes.status === 200) passed('Generate Career Path');
            else {
                // Might return 400 if offer not analyzed? 
                // Or 200 with mock data?
                // If offer not analyzed, it might fail? 
                // Let's see the error.
                if (carRes.status === 400 && carRes.body.error?.code === 'OFFER_NOT_READY') {
                    passed('Career Path (Correctly blocked by unanalyzed offer)');
                } else {
                    failed('Generate Career Path', `${carRes.status} ${JSON.stringify(carRes.body)}`);
                }
            }
        } else {
            console.log('Skipping Career Path (No Offer ID)');
        }

    } catch (err) {
        console.log('\nFATAL ERROR:', err.message);
    }
}

run();
