import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerPlugins } from '@/plugins/index.js';
import { errorHandler } from '@/middleware/error-handler.js';
import { registerRateLimiter } from '@/middleware/rate-limiter.js';
import { requestLogger } from '@/middleware/request-logger.js';
import { offerRoutes } from '@/modules/offer/offer.routes.js';
import { analysisRoutes } from '@/modules/analysis/analysis.routes.js';
import { metadataRoutes } from '@/modules/metadata/metadata.routes.js';
import { featureRequestRoutes } from '@/modules/feature-request/feature-request.routes.js';
import { healthRoutes } from '@/modules/health/health.routes.js';
import { authRoutes } from '@/modules/auth/auth.routes.js';
import { userRoutes } from '@/modules/user/user.routes.js';
import { negotiationRoutes } from '@/modules/negotiation/negotiation.routes.js';
import { benefitsRoutes } from '@/modules/benefits/benefits.routes.js';
import { comparisonRoutes } from '@/modules/comparison/comparison.routes.js';
import { correctionRoutes } from '@/modules/correction/correction.routes.js';
import { salaryRoutes } from '@/modules/salary/salary.routes.js';
import { careerRoutes } from '@/modules/career/career.routes.js';
import { forumRoutes } from '@/modules/forum/forum.routes.js';
import { authenticate } from '@/middleware/authenticate.js';
import providersPlugin from '@/plugins/providers.js';

export function buildApp() {
    const app = Fastify({
        logger: true, // We use custom request logger but standard logger for internals
        disableRequestLogging: true, // Disable default to use ours
    });

    // Type Provider Setup
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Plugins
    app.register(registerPlugins);
    app.register(providersPlugin);

    // Middleware
    app.setErrorHandler(errorHandler);
    // Guest identity is established by the guest-identity plugin inside registerPlugins
    // above, which loads before this so keyGenerator can read request.guestId.
    app.register(registerRateLimiter);
    app.addHook('onRequest', authenticate); // JWT Auth
    app.addHook('onRequest', requestLogger);

    // Routes
    app.register(async (api) => {
        // API v1 prefix
        await api.register(healthRoutes);
        await api.register(authRoutes, { prefix: '/auth' });
        await api.register(userRoutes, { prefix: '/users' });
        await api.register(offerRoutes, { prefix: '/offers' });
        await api.register(analysisRoutes); // mounts /offers/:id/analysis inside
        await api.register(metadataRoutes, { prefix: '/metadata' });
        await api.register(featureRequestRoutes, { prefix: '/feature-requests' });

        // Feature Routes

        await api.register(negotiationRoutes);
        await api.register(benefitsRoutes);
        await api.register(comparisonRoutes);
        await api.register(correctionRoutes);
        await api.register(salaryRoutes);
        await api.register(careerRoutes);
        await api.register(forumRoutes, { prefix: '/forum' });
    }, { prefix: '/api/v1' });

    return app;
}
