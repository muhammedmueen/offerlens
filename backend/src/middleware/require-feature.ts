import type { FastifyRequest } from 'fastify';
import type { FeatureGate, Tier } from '@/config/plans.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { tierForRequest } from '@/modules/quota/quota.service.js';

export type FeatureGuard = ((req: FastifyRequest) => Promise<void>) & { featureGate: FeatureGate };

/**
 * The one feature-gate guard (task 4.2). Place it AFTER `requireRegistered`:
 *
 *   preHandler: [requireRegistered, requireFeature('careerPath')]
 *
 * 403 FEATURE_NOT_IN_PLAN when the caller's plan has the gate closed. Every gate is open on
 * every plan today, so this changes nothing yet; closing one is a one-line edit in PLANS.
 * `featureGate` is exposed so a test can prove each route is wired to the right gate.
 */
export function requireFeature(
    gate: FeatureGate,
    loadTier: (req: FastifyRequest) => Promise<Tier> = tierForRequest,
): FeatureGuard {
    const guard = async (req: FastifyRequest) => {
        const tier = await loadTier(req);
        if (!tier.features[gate]) {
            throw new AppError(ERROR_CODES.FEATURE_NOT_IN_PLAN, 'Your plan does not include this feature', 403, {
                feature: gate,
                plan: tier.id,
            });
        }
    };
    return Object.assign(guard, { featureGate: gate });
}
