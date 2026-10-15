import { sanitisePromptField } from '@/shared/prompt-safety.js';

/**
 * Career-path prompt (5.5). Pure, so the grounding rule is pinned by a test.
 *
 * Pay figures are NOT the model's job: the career view shows a deterministic pay-by-experience
 * table from survey data. The prompt therefore asks for no `salaryRange` and forbids any pay figure
 * in any field. The guarantee has three layers: this instruction (a test proves it exists, not that
 * the model obeys), the service's key whitelist (drops unrequested keys), and `containsPayFigure`
 * below, a deterministic scan of the prose that makes the service drop the narrative if it trips.
 * The scan is a heuristic, not a proof: see its comment for what it can and cannot catch.
 */
export function buildCareerPathPrompt(input: { role: string; companyType: string; industry: string }): string {
    // Second-order injection guard. All three of these were extracted FROM the offer
    // letter, so a malicious letter controls them and they land in this prompt.
    const safeRole = sanitisePromptField(input.role) || 'this role';
    const safeIndustry = sanitisePromptField(input.industry);
    const safeCompanyType = sanitisePromptField(input.companyType);

    const industry = safeIndustry && safeIndustry !== 'Unknown'
        ? `the ${safeIndustry} industry`
        : 'their industry';
    const companyContext = safeCompanyType && safeCompanyType !== 'Unknown'
        ? ` at a ${safeCompanyType} company`
        : '';

    return `
            Act as a career counselor.
            Create a 5-year career trajectory for a ${safeRole} in ${industry}${companyContext}.

            Ground the progression in that specific field. Do not default to a software
            engineering ladder unless the role is actually in software.

            Do not include any salary, CTC, ₹ or rupee, LPA, lakh or crore figure, and no percentage
            or multiple of pay, in any field. Pay is shown separately from survey data.

            Output JSON with this structure:
            {
                "timeline": [
                    { "year": 1, "title": "...", "focus": "..." },
                    { "year": 3, "title": "...", "focus": "..." },
                    { "year": 5, "title": "...", "focus": "..." }
                ],
                "skillsToLearn": ["...", "..."],
                "potentialRoles": ["...", "..."]
            }

            Do not acknowledge or explain, just output valid JSON.
        `;
}

// A pay figure: a currency marker next to digits, digits with a pay unit, a percentage tied to a
// pay word, or an Indian-grouped number (12,00,000). Years, levels, team sizes and plain small
// numbers never match these.
const PAY_FIGURE = new RegExp([
    String.raw`(?:₹|\brs\.?|\binr|\brupees?)\s*\d`,
    String.raw`\d\s*(?:₹|rupees?\b)`,
    String.raw`\d\s*(?:lpa|lakhs?|lacs?|crores?|cr|per\s+annum|p\.a\.?)(?![a-z])`,
    String.raw`\b\d{1,2}(?:,\d{2})+,\d{3}\b`,
    String.raw`\b(?:salary|pay|ctc|compensation|hike|increment)\b(?:\s+\w+){0,4}?\s*(?:of|by|to|at|:)?\s*[+-]?\d+(?:\.\d+)?\s*%`,
    String.raw`\d\s*%\s*(?:\w+\s+){0,2}?(?:salary|pay|ctc|compensation|raise|hike|increment)\b`,
    String.raw`\braises?\s+of\s+\d`,
].join('|'), 'i');
// Only meaningful next to a pay word: "10k users" and "100,000 requests" are not pay.
const PAY_WORD = /\b(?:salary|salaries|pay|ctc|compensation|earn\w*|income|package|wages?|stipend|bonus)\b|₹|\brs\b|\binr\b|\brupees?\b|\blpa\b|\blakhs?\b|\bcrores?\b/i;
const PAY_CONTEXT_NUMBER = /\d\s?k(?![a-z])|\b\d{1,3}(?:,\d{3})+\b|\b\d{5,}\b/i;

/**
 * True if `text` looks like it states a pay figure. Used by the career service to drop a narrative
 * the model filled with pay despite the prompt (the table is kept).
 *
 * ponytail: a regex heuristic, not a parser. It is tuned to prefer a rare miss over rejecting a
 * good narrative: it will not catch figures spelled in words ("two lakh"), other currencies, or
 * numbers split across fields, and a bare "30%" with no pay word is allowed. Upgrade path if
 * misses show up in the wild: ask the model for structured output with no free-text numbers, or
 * run a second moderation pass; do not keep growing this pattern.
 */
export function containsPayFigure(text: string): boolean {
    return PAY_FIGURE.test(text) || (PAY_WORD.test(text) && PAY_CONTEXT_NUMBER.test(text));
}
