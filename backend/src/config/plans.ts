/**
 * Plans as code (task 4.2).
 *
 * Pure: imports nothing from `@/config/index.js`, so the Drizzle schema files can import it
 * relatively (drizzle-kit loads them without the path alias).
 *
 * `null` in `daily` means unlimited. A plan is assigned by a manual SQL UPDATE on `users.plan`
 * (see docs/LOCAL_DEVELOPMENT.md). Pass plans wait for task 6.1.
 */
export const PLAN_IDS = ['free', 'unlimited'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const QUOTA_FEATURES = ['analysis', 'autofill', 'career', 'negotiation'] as const;
export type QuotaFeature = (typeof QUOTA_FEATURES)[number];

export const FEATURE_GATES = ['negotiationEmail', 'comparison', 'careerPath', 'benefitsCalculator'] as const;
export type FeatureGate = (typeof FEATURE_GATES)[number];

export type TierId = PlanId | 'guest';

export interface Tier {
    id: TierId;
    daily: Record<QuotaFeature, number | null>;
    features: Record<FeatureGate, boolean>;
    allowModelSelection: boolean;
}

const ALL_FEATURES = (enabled: boolean) =>
    Object.fromEntries(FEATURE_GATES.map((g) => [g, enabled])) as Record<FeatureGate, boolean>;

export const DEFAULT_PLAN: PlanId = 'free';

export const PLANS: Record<PlanId, Tier> = {
    // Every gate open at launch: locking one later is a one-line edit here.
    free: {
        id: 'free',
        daily: { analysis: 3, autofill: 30, career: 10, negotiation: 10 },
        features: ALL_FEATURES(true),
        allowModelSelection: false,
    },
    // Owner and testers.
    unlimited: {
        id: 'unlimited',
        daily: { analysis: null, autofill: null, career: null, negotiation: null },
        features: ALL_FEATURES(true),
        allowModelSelection: true,
    },
};

/**
 * Not a plan: the limits for a visitor without an account. Career and negotiation are 0 and
 * the gates closed as defence in depth — `requireRegistered` already stops guests there.
 */
export const GUEST: Tier = {
    id: 'guest',
    daily: { analysis: 1, autofill: 30, career: 0, negotiation: 0 },
    features: ALL_FEATURES(false),
    allowModelSelection: false,
};

/** The tier for a `users.plan` value. Unknown or missing falls back to the default plan. */
export function planFor(value: string | null | undefined): Tier {
    return (PLAN_IDS as readonly string[]).includes(value ?? '') ? PLANS[value as PlanId] : PLANS[DEFAULT_PLAN];
}

/** Whether a caller may pick the AI model. Always allowed outside production. */
export function canSelectModel(tier: Tier, nodeEnv: string): boolean {
    return tier.allowModelSelection || nodeEnv !== 'production';
}
