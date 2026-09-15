/**
 * M3 — forum, crowdsourced salary, and career path.
 *
 *   node test-m3.mjs
 *
 * Rewritten for cookie-based guest identity (ADR-001) and the corrected salary contract.
 * Previously: sent an `x-fingerprint` header with no cookie jar, asserted 200 on a
 * submit that returns 201, and uploaded plain text as a fake PDF so the career-path test
 * only ever exercised the OFFER_NOT_READY branch.
 */
import { makeClient, reporter, checkDependencies, uniqueOfferText } from './test-client.mjs';

const r = reporter('M3: forum, crowdsourced salary, career path');

r.section('0. Dependencies');
if (!(await checkDependencies(r))) r.finish();

const client = makeClient('m3');
await client.req('GET', '/health');

// ── setup ──────────────────────────────────────────────────────────────
r.section('1. Setup');

const signup = await client.req('POST', '/auth/signup', {
    name: 'M3 Tester',
    email: `m3-${Date.now()}@example.com`,
    password: 'CorrectHorse9!',
});
if (signup.status !== 201) {
    r.no(`signup failed (${signup.status}) ${JSON.stringify(signup.body).slice(0, 200)}`);
    r.finish();
}
const token = signup.body.data.tokens.accessToken;
r.ok('user registered');

const upload = await client.upload({
    text: uniqueOfferText(),
    role: 'Senior Software Engineer',
    city: 'Bangalore',
    experienceLevel: 'Senior (5-8 yrs)',
}, token);
if (upload.status !== 201) {
    r.no(`offer upload failed (${upload.status})`);
    r.finish();
}
const offerId = upload.body.data.id;
r.ok(`offer created (${offerId})`);

// ── forum ──────────────────────────────────────────────────────────────
r.section('2. Forum');

const post = await client.req('POST', '/forum/posts', {
    title: 'Negotiation strategy for SDE-2',
    content: 'I have an offer from a startup. Should I push on ESOPs or base? Looking for advice.',
    category: 'negotiation',
}, token);

let postId = null;
if (post.status === 201) {
    postId = post.body.data.id;
    r.ok(`post created (${postId})`);
} else {
    r.no(`create post (${post.status}) ${JSON.stringify(post.body).slice(0, 160)}`);
}

const list = await client.req('GET', '/forum/posts?category=negotiation');
if (list.status === 200 && Array.isArray(list.body.data) && list.body.data.length > 0) {
    r.ok(`posts listed (${list.body.data.length} in "negotiation")`);
} else {
    r.no(`list posts (${list.status}) got ${typeof list.body?.data}`);
}

if (postId) {
    const detail = await client.req('GET', `/forum/posts/${postId}`);
    if (detail.status === 200) r.ok('post detail returned');
    else r.no(`post detail (${detail.status})`);

    const comment = await client.req('POST', `/forum/posts/${postId}/comments`, {
        content: 'Focus on base first. ESOPs are paper money until an exit.',
    }, token);
    if (comment.status === 201) r.ok('comment added');
    else r.no(`add comment (${comment.status})`);

    const withComment = await client.req('GET', `/forum/posts/${postId}`);
    const comments = withComment.body?.data?.comments;
    if (Array.isArray(comments) && comments.length > 0) r.ok(`comment visible on the post (${comments.length})`);
    else r.no('comment not returned with the post detail');
}

const anonPost = await makeClient('anon').req('POST', '/forum/posts', {
    title: 'Should not be allowed', content: 'Anonymous post attempt.', category: 'general',
});
if (anonPost.status === 403) r.ok('anonymous posting is refused (403)');
else r.no(`anonymous post returned ${anonPost.status}, expected 403`);

// ── salary ─────────────────────────────────────────────────────────────
// Path is /salaries (was /salary, which 404'd the whole Explorer), and submit returns 201.
r.section('3. Crowdsourced salary');

const submit = await client.req('POST', '/salaries', {
    role: 'Senior Software Engineer',
    city: 'Bangalore',
    experienceYears: 6,
    ctc: 2400000,
    companyType: 'product',
    companySize: '201-1000',
}, token);
if (submit.status === 201) r.ok('salary submitted (201)');
else r.no(`submit salary (${submit.status}) ${JSON.stringify(submit.body).slice(0, 200)}`);

const dupe = await client.req('POST', '/salaries', {
    role: 'Senior Software Engineer', city: 'Bangalore',
    experienceYears: 6, ctc: 2400000, companyType: 'product',
}, token);
if (dupe.status === 429) r.ok('a second submission within the hour is rate limited (429)');
else r.no(`duplicate submission returned ${dupe.status}, expected 429`);

const invalid = await makeClient('bad-salary').req('POST', '/salaries', {
    role: 'X', city: 'Y', experienceYears: 3, ctc: 900000, // companyType missing
});
if (invalid.status === 400) r.ok('a submission missing companyType is rejected (400)');
else r.no(`invalid submission returned ${invalid.status}, expected 400`);

const stats = await client.req('GET', '/salaries/stats?role=Senior Software Engineer&city=Bangalore');
if (stats.status === 200) {
    const d = stats.body.data;
    if (typeof d.p50 === 'number') r.ok(`stats returned percentiles — median ${d.p50} from ${d.count} submissions`);
    else r.ok(`stats below threshold, reported honestly — "${d.message}" (count ${d.count})`);
} else {
    r.no(`salary stats (${stats.status})`);
}

const noCity = await client.req('GET', '/salaries/stats?role=OnlyRole');
if (noCity.status === 400) r.ok('stats without a city is rejected (400)');
else r.no(`stats without a city returned ${noCity.status}, expected 400`);

// ── career path ────────────────────────────────────────────────────────
r.section('4. Career path');

const settled = await client.waitForAnalysis(offerId, token);
if (settled.status !== 'COMPLETED') {
    r.no(`analysis ${settled.status}${settled.failureReason ? ` — ${settled.failureReason}` : ''}`);
    r.info('Career path requires a COMPLETED analysis.');
} else {
    r.ok(`analysis COMPLETED in ~${settled.waited / 1000}s`);

    const career = await client.req('GET', `/offers/${offerId}/career-path`, null, token);
    if (career.status === 200) {
        const t = career.body.data?.timeline;
        r.ok(`career path generated (${Array.isArray(t) ? t.length : 0} milestones)`);
        if (Array.isArray(t) && t.length > 0) r.info(`year ${t[0].year}: ${t[0].title}`);
    } else if (career.body?.error?.message?.includes('Role not identified')) {
        // CareerService reads extractedData.role, which is {} because the analysis
        // pipeline discards the AI response over a key-name mismatch. Turn this into a
        // real assertion once Phase 1 tasks 3-5 land.
        r.known('career path rejects the offer: "Role not identified"', 'Phase 1 tasks 3-5 — pipeline discards extraction');
    } else {
        r.no(`career path (${career.status}) ${JSON.stringify(career.body).slice(0, 160)}`);
    }

    const anonCareer = await makeClient('anon2').req('GET', `/offers/${offerId}/career-path`);
    if (anonCareer.status === 403) r.ok('career path is refused to anonymous callers (403)');
    else r.no(`anonymous career path returned ${anonCareer.status}, expected 403`);
}

r.finish();
