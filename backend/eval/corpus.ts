/**
 * Extraction accuracy corpus (Phase 0a / 0b).
 *
 * ── READ THIS BEFORE TRUSTING THE NUMBERS ────────────────────────────────────
 * These letters are SYNTHETIC. That is a real methodological weakness, not a
 * detail: they were written by the same kind of model whose extraction they
 * measure, so they risk being unrepresentatively easy — predictable phrasing,
 * conveniently placed figures, no genuine OCR damage.
 *
 * Treat the resulting score as a REGRESSION BASELINE, not as an accuracy claim.
 * It is trustworthy for "did this change make extraction better or worse", and
 * not trustworthy for "extraction is N% accurate in the real world".
 *
 * Replace these with real anonymised offer letters when any are available. The
 * harness does not care where the text comes from.
 *
 * Mitigations applied deliberately:
 *   - multiple locales and currencies (INR, USD, monthly vs annual)
 *   - Indian magnitude words (lakh, crore, LPA) alongside digit grouping
 *   - deliberately incomplete offers, to catch invented data
 *   - one case with simulated OCR damage
 *   - ambiguous and non-standard job titles
 *   - red-flag clauses phrased differently across cases
 */

/** Ground truth for one letter. `null` means "genuinely absent from the text". */
export interface Expected {
    companyName: string | null;
    role: string | null;
    location: string | null;
    /** Annual total, in the letter's own currency. */
    totalCTC: number | null;
    currency: string | null;
    /** Canonical benefit keywords. Scored as set overlap, not exact strings. */
    benefits: string[];
    /** Red flag types from the RedFlag union in analysis.types.ts. */
    redFlagTypes: string[];
    noticePeriod: string | null;
    probationPeriod: string | null;
}

export interface EvalCase {
    id: string;
    /** What this case is meant to probe, so a failure is diagnosable. */
    probes: string;
    text: string;
    expected: Expected;
}

export const CORPUS: EvalCase[] = [
    {
        id: '01-indian-product-clean',
        probes: 'Baseline: well-formatted Indian offer, every field present',
        text: `
OFFER OF EMPLOYMENT

Dear Ananya Sharma,

We are delighted to offer you the position of Senior Software Engineer at Zenthara
Technologies Private Limited, based at our Bengaluru office.

Your annual cost to company will be INR 24,00,000, comprising a basic salary of
INR 12,00,000, a house rent allowance of INR 4,80,000, a performance bonus of up to
INR 3,00,000, and employer provident fund contributions as per statute.

You will be enrolled in our group health insurance scheme with coverage of
INR 5,00,000 for you and your dependents. You are entitled to 22 days of paid leave
per year, and an annual learning allowance of INR 30,000.

Your probation period will be three months. The notice period following confirmation
is 60 days.

We look forward to welcoming you on 5 January 2027.

Sincerely,
Head of Talent, Zenthara Technologies Private Limited
`.trim(),
        expected: {
            companyName: 'Zenthara Technologies Private Limited',
            role: 'Senior Software Engineer',
            location: 'Bengaluru',
            totalCTC: 2400000,
            currency: 'INR',
            benefits: ['health insurance', 'paid leave', 'provident fund', 'learning allowance'],
            redFlagTypes: [],
            noticePeriod: '60 days',
            probationPeriod: '3 months',
        },
    },

    {
        id: '02-service-company-bond',
        probes: 'Service bond and training cost recovery — should be a high-severity flag',
        text: `
LETTER OF APPOINTMENT

Candidate: Rahul Menon
Designation: Systems Engineer Trainee
Location: Chennai
Annual Compensation: Rs. 3,60,000 per annum (all inclusive)

You will undergo an initial training programme of 90 days. In consideration of the
training provided, you agree to serve the Company for a minimum period of 24 months
from the date of joining. Should you resign before completing this minimum service
period, you shall be liable to reimburse the Company a sum of Rs. 2,00,000 towards
recovery of training costs.

Medical insurance and provident fund are provided as per Company policy.

The notice period during the service commitment is 90 days.
`.trim(),
        expected: {
            companyName: null,
            role: 'Systems Engineer Trainee',
            location: 'Chennai',
            totalCTC: 360000,
            currency: 'INR',
            benefits: ['medical insurance', 'provident fund'],
            redFlagTypes: ['bond', 'clawback'],
            noticePeriod: '90 days',
            probationPeriod: null,
        },
    },

    {
        id: '03-startup-vague-equity',
        probes: 'Equity with no strike price or vesting — must be flagged, not invented',
        text: `
Hey Priya,

The team loved meeting you. We would love for you to join Kettlefish Labs as our
Founding Product Engineer, working out of our Gurugram studio (hybrid, 3 days in).

Compensation: ₹32 LPA fixed, plus a meaningful equity grant. Equity will be discussed
and finalised after your first quarter, subject to board approval. We think you'll do
very well here.

Perks: unlimited leave policy, top-tier laptop, and a wellness stipend.

Notice period: 30 days either side. No formal probation.
`.trim(),
        expected: {
            companyName: 'Kettlefish Labs',
            role: 'Founding Product Engineer',
            location: 'Gurugram',
            totalCTC: 3200000,
            currency: 'INR',
            benefits: ['unlimited leave', 'wellness stipend', 'equipment'],
            redFlagTypes: ['vague_compensation', 'missing_benefit'],
            noticePeriod: '30 days',
            probationPeriod: null,
        },
    },

    {
        id: '04-us-offer-at-will',
        probes: 'USD, 401k, at-will employment — non-Indian locale must not be forced into INR',
        text: `
Dear Jordan,

Northgate Analytics, Inc. is pleased to offer you the role of Staff Data Engineer,
reporting to our Austin, Texas office.

Your annual base salary will be $185,000, paid semi-monthly. You will be eligible for
an annual target bonus of 15% of base salary, and a new hire equity grant of 4,000
restricted stock units vesting over four years with a one-year cliff.

Benefits include medical, dental and vision coverage, a 401(k) plan with a 4% company
match, and 20 days of paid time off plus 11 company holidays.

Please note that employment with Northgate Analytics, Inc. is at-will, and may be
terminated by either party at any time, with or without cause or notice.
`.trim(),
        expected: {
            companyName: 'Northgate Analytics, Inc.',
            role: 'Staff Data Engineer',
            location: 'Austin, Texas',
            totalCTC: 185000,
            currency: 'USD',
            benefits: ['medical insurance', 'dental', 'vision', '401k', 'paid time off'],
            redFlagTypes: ['other'],
            noticePeriod: null,
            probationPeriod: null,
        },
    },

    {
        id: '05-red-flag-heavy',
        probes: 'Four distinct flag types in one letter — tests recall, not just precision',
        text: `
APPOINTMENT LETTER

Position: Lead Backend Engineer
Company: Vireo Systems Pvt Ltd, Pune
CTC: ₹28,00,000 per annum

Terms and Conditions:

1. Your employment is subject to a probation period of six months. During probation,
   your services may be terminated without notice and without assigning any reason.

2. You shall not, for a period of 18 months following cessation of employment, engage
   in or be associated with any business competing with the Company anywhere in India.

3. All intellectual property, inventions and works of authorship created by you during
   the term of your employment, whether or not during working hours, shall vest
   absolutely with the Company.

4. The joining bonus of ₹1,50,000 is recoverable in full should you leave within
   12 months of joining.

5. Notice period post-confirmation is 90 days.

Provident fund is deducted as per statute.
`.trim(),
        expected: {
            companyName: 'Vireo Systems Pvt Ltd',
            role: 'Lead Backend Engineer',
            location: 'Pune',
            totalCTC: 2800000,
            currency: 'INR',
            benefits: ['provident fund'],
            redFlagTypes: ['probation', 'non_compete', 'ip_assignment', 'clawback', 'missing_benefit'],
            noticePeriod: '90 days',
            probationPeriod: '6 months',
        },
    },

    {
        id: '06-minimal-offer',
        probes: 'Sparse letter — absent fields must come back null rather than invented',
        text: `
Dear Candidate,

We are pleased to confirm your appointment as Business Analyst with an annual
compensation of ₹9,50,000.

Further details regarding your joining will be shared by the HR team.

Regards,
Human Resources
`.trim(),
        expected: {
            companyName: null,
            role: 'Business Analyst',
            location: null,
            totalCTC: 950000,
            currency: 'INR',
            benefits: [],
            redFlagTypes: ['vague_compensation', 'missing_benefit'],
            noticePeriod: null,
            probationPeriod: null,
        },
    },

    {
        id: '07-ocr-damaged',
        probes: 'Simulated OCR damage: broken words, lost spacing, stray glyphs',
        text: `
OFFEROF APPOINTMENT

Dear Sir/Madam,

Wearepleased to offer you the post of Quality AssuranceEngineer at Hallowmere
Infotech Limited , Hyderabad.

Your annua1 CTC shal1 be Rs. 7,20,OOO/- (Rupees Seven Lakh Twenty Thousand only).

Benef1ts : Group Med1cal Insurance , Prov1dent Fund , 15 days ear ned leave.

Probat1on : 6 (six) months . N0tice per1od : 3O days .
`.trim(),
        expected: {
            companyName: 'Hallowmere Infotech Limited',
            role: 'Quality Assurance Engineer',
            location: 'Hyderabad',
            totalCTC: 720000,
            currency: 'INR',
            benefits: ['medical insurance', 'provident fund', 'earned leave'],
            redFlagTypes: [],
            noticePeriod: '30 days',
            probationPeriod: '6 months',
        },
    },

    {
        id: '08-monthly-salary',
        probes: 'Monthly figure that must be annualised, not reported as the annual CTC',
        text: `
Employment Offer

Name: Kavya Iyer
Role: Graphic Designer
Employer: Brightloom Studio LLP, Kochi

Remuneration: ₹45,000 per month, payable on the last working day of each month.

You will be entitled to 12 days of casual leave annually. Employee State Insurance
and Provident Fund will apply as per statute.

Probation: 90 days. Notice: 1 month.
`.trim(),
        expected: {
            companyName: 'Brightloom Studio LLP',
            role: 'Graphic Designer',
            location: 'Kochi',
            totalCTC: 540000,
            currency: 'INR',
            benefits: ['casual leave', 'provident fund', 'employee state insurance'],
            redFlagTypes: [],
            noticePeriod: '1 month',
            probationPeriod: '90 days',
        },
    },

    {
        id: '09-crore-notation',
        probes: 'Crore magnitude word — a unit-blind parser reports 1.4 instead of 14,000,000',
        text: `
STRICTLY PRIVATE & CONFIDENTIAL

Dear Dr. Nair,

On behalf of the Board, I am pleased to offer you the position of Vice President,
Engineering at Solaris Renewables Limited, Mumbai.

Your total annual compensation will be ₹1.4 crore, structured as ₹90 lakh fixed pay,
₹35 lakh performance-linked variable pay, and a long term incentive of ₹15 lakh
payable at the end of each completed year of service.

You will receive executive health cover of ₹25 lakh, a company car, club membership,
and 30 days of annual leave.

Notice period: six months.
`.trim(),
        expected: {
            companyName: 'Solaris Renewables Limited',
            role: 'Vice President, Engineering',
            location: 'Mumbai',
            totalCTC: 14000000,
            currency: 'INR',
            benefits: ['health insurance', 'company car', 'club membership', 'annual leave'],
            redFlagTypes: [],
            noticePeriod: '6 months',
            probationPeriod: null,
        },
    },

    {
        id: '10-fixed-term-contract',
        probes: 'Fixed-term contract, not permanent employment',
        text: `
CONTRACT FOR SERVICES

This agreement is between Ardent Consulting Group and Sameer Qureshi for the
engagement of a Technical Writer on a fixed term basis of 11 months, based in Noida.

Professional fees: ₹75,000 per month, invoiced monthly. No statutory benefits,
gratuity, or provident fund shall accrue for the duration of this engagement.

This contract may be terminated by either party with 15 days written notice. The
Company reserves the right to terminate immediately for unsatisfactory performance,
at its sole discretion.

You shall not solicit or accept work from any client of the Company for 12 months
following termination.
`.trim(),
        expected: {
            companyName: 'Ardent Consulting Group',
            role: 'Technical Writer',
            location: 'Noida',
            totalCTC: 900000,
            currency: 'INR',
            benefits: [],
            redFlagTypes: ['non_compete', 'missing_benefit', 'vague_compensation'],
            noticePeriod: '15 days',
            probationPeriod: null,
        },
    },

    {
        id: '11-ambiguous-title',
        probes: 'Non-standard title that resists role matching',
        text: `
Dear Aditi,

Welcome aboard. Your title with Meridian Compute Labs will be Member of Technical
Staff II, sitting with the distributed systems group in Bengaluru.

Fixed annual compensation: ₹41,00,000. Additionally you will receive an ESOP grant of
6,000 options at a strike price of ₹120 per option, vesting 25% annually over four
years with a twelve month cliff.

Health cover of ₹10,00,000 for you, your spouse, children and parents. Provident fund
as per statute. 24 days annual leave plus 10 public holidays. Annual conference and
certification budget of ₹75,000.

Probation: none. Notice period: 60 days.
`.trim(),
        expected: {
            companyName: 'Meridian Compute Labs',
            role: 'Member of Technical Staff II',
            location: 'Bengaluru',
            totalCTC: 4100000,
            currency: 'INR',
            benefits: ['health insurance', 'provident fund', 'annual leave', 'esop', 'learning budget'],
            redFlagTypes: [],
            noticePeriod: '60 days',
            probationPeriod: null,
        },
    },

    {
        id: '12-internship-conversion',
        probes: 'Two compensation figures in sequence — stipend then full-time',
        text: `
INTERNSHIP CUM EMPLOYMENT OFFER

Candidate: Nikhil Bose
Organisation: Peregrine Data Sciences Pvt. Ltd., Bhubaneswar
Role: Machine Learning Intern, converting to Machine Learning Engineer

You will serve a six month internship at a stipend of ₹25,000 per month. Subject to
satisfactory performance as assessed solely by the Company, you will be confirmed as
a full time Machine Learning Engineer at an annual CTC of ₹12,00,000.

During the internship no benefits are applicable. Post confirmation you will be
covered by group medical insurance and provident fund.

Notice period during internship: 7 days. Post confirmation: 60 days.
`.trim(),
        expected: {
            companyName: 'Peregrine Data Sciences Pvt. Ltd.',
            role: 'Machine Learning Intern',
            location: 'Bhubaneswar',
            totalCTC: 1200000,
            currency: 'INR',
            benefits: ['medical insurance', 'provident fund'],
            redFlagTypes: ['vague_compensation', 'probation'],
            noticePeriod: '60 days',
            probationPeriod: '6 months',
        },
    },

    {
        id: '13-tabular-layout',
        probes: 'Compensation as a flattened table, the shape PDF extraction typically yields',
        text: `
COMPENSATION STRUCTURE — ANNEXURE A
Employer: Calderwood Financial Services Limited
Employee: Tanvi Deshpande
Designation: Assistant Manager, Risk
Base Location: Ahmedabad

Component                        Amount (INR per annum)
Basic Salary                     600000
House Rent Allowance             240000
Conveyance Allowance              38400
Special Allowance                421600
Employer PF Contribution          72000
Gratuity Provision                28000
Total Cost to Company           1400000

Group Mediclaim: ₹4,00,000 floater. Group Term Life: ₹50,00,000.
Earned Leave: 18 days per annum.
Probation: 6 months. Notice: 60 days.
`.trim(),
        expected: {
            companyName: 'Calderwood Financial Services Limited',
            role: 'Assistant Manager, Risk',
            location: 'Ahmedabad',
            totalCTC: 1400000,
            currency: 'INR',
            benefits: ['mediclaim', 'term life insurance', 'earned leave', 'provident fund', 'gratuity'],
            redFlagTypes: [],
            noticePeriod: '60 days',
            probationPeriod: '6 months',
        },
    },

    {
        id: '14-remote-cross-border',
        probes: 'Remote role, foreign employer, contractor status',
        text: `
Dear Farhan,

Lumenward B.V. is delighted to engage you as a Senior Frontend Engineer on a fully
remote basis. You will remain a resident of India and will be engaged as an
independent contractor.

Your annual fee will be USD 72,000, invoiced monthly in twelve equal instalments.
As an independent contractor you are responsible for your own taxes, insurance and
retirement provision. No paid leave, medical cover or statutory benefit is provided.

We ask for 30 days notice of termination from either party.

Any tools, code or documentation you produce in connection with this engagement is
assigned to Lumenward B.V. upon creation.
`.trim(),
        expected: {
            companyName: 'Lumenward B.V.',
            role: 'Senior Frontend Engineer',
            location: 'Remote',
            totalCTC: 72000,
            currency: 'USD',
            benefits: [],
            redFlagTypes: ['missing_benefit', 'ip_assignment'],
            noticePeriod: '30 days',
            probationPeriod: null,
        },
    },

    {
        id: '15-variable-heavy',
        probes: 'Large variable component — "up to" phrasing should not inflate the fixed figure',
        text: `
Dear Ishaan,

Congratulations. Northbridge Retail Solutions is pleased to offer you the role of
Regional Sales Manager, West, based in Surat.

Fixed annual salary: ₹11,00,000.
Sales incentive: up to ₹9,00,000 per annum, entirely dependent on achievement of
quarterly targets as determined by management from time to time.
Travel reimbursement at actuals against submitted bills.

Total earning potential of ₹20,00,000 per annum.

Mediclaim of ₹3,00,000 and provident fund apply. 15 days privilege leave per year.

Probation: three months. Notice: 30 days.
`.trim(),
        expected: {
            companyName: 'Northbridge Retail Solutions',
            role: 'Regional Sales Manager',
            location: 'Surat',
            totalCTC: 2000000,
            currency: 'INR',
            benefits: ['mediclaim', 'provident fund', 'privilege leave', 'travel reimbursement'],
            redFlagTypes: ['vague_compensation'],
            noticePeriod: '30 days',
            probationPeriod: '3 months',
        },
    },

    {
        id: '16-non-tech-role',
        probes: 'Outside the seeded role list — role matching must degrade, not fabricate',
        text: `
APPOINTMENT — TEACHING FACULTY

The Management of Ravenscourt International School, Dehradun, is pleased to appoint
Ms. Leela Krishnan as Senior Secondary Physics Teacher for the academic session
commencing April 2027.

Consolidated monthly salary: ₹62,000. Annual increment subject to performance review.

The school provides subsidised staff accommodation, free tuition for up to two
children of the employee, and contributory provident fund. Leave as per the school
calendar.

Either party may terminate this appointment by giving three months notice, provided
that no resignation shall be accepted during an ongoing academic term.
`.trim(),
        expected: {
            companyName: 'Ravenscourt International School',
            role: 'Senior Secondary Physics Teacher',
            location: 'Dehradun',
            totalCTC: 744000,
            currency: 'INR',
            benefits: ['accommodation', 'tuition waiver', 'provident fund', 'leave'],
            redFlagTypes: ['other', 'missing_benefit'],
            noticePeriod: '3 months',
            probationPeriod: null,
        },
    },
];
