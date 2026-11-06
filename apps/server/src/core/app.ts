import { enabledFeaturesResponse, healthResponse, type HealthResponse } from '@remidy/contracts';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type RouteOptions,
} from 'fastify';
import { registerAuthRoutes, type Auth } from './auth/index.ts';
import { AppError, registerErrorHandling } from './errors.ts';
import {
  defineFeature,
  defineRoute,
  denyAll,
  type Authorize,
  type Feature,
  type FeatureDependencies,
  type Route,
} from './feature.ts';
import { requestId } from './logging.ts';
import type { Orm } from '@remidy/db';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_BODY_BYTES = 256 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEALTH_URL = '/api/health';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Set only by registerRoute, so anything added another way is refused at startup. */
    declaredRoute?: boolean;
  }
  interface FastifyInstance {
    /** Every route in the app. The permission test walks this list. */
    declaredRoutes: Route[];
  }
}

interface AppOptions {
  database: Pick<FeatureDependencies['database'], 'ping'> &
    Partial<FeatureDependencies['database']>;
  logger?: FastifyServerOptions['logger'];
  features?: Feature[];
  enabledFeatures?: string[];
  authorize?: Authorize;
  /** Sign-in, once a real database is available. */
  auth?: { auth: Auth; orm: Orm };
  /** Where the app is served from. Requests from any other site are refused. */
  publicUrl?: string;
  /** Requests allowed per minute from one address, across all routes. */
  requestsPerMinute?: number;
  /** Requests allowed per minute from one address to the sign-in routes. */
  authRequestsPerMinute?: number;
  /** Addresses of reverse proxies in front of the app, separated by commas. */
  trustProxy?: string;
}

function coreFeature(database: AppOptions['database'], enabledFeatures: string[]): Feature {
  return defineFeature({
    name: 'core',
    routes: () => [
      defineRoute({
        method: 'GET',
        url: HEALTH_URL,
        access: 'public',
        response: healthResponse,
        // Checked every few seconds by Docker, so only problems are worth logging.
        logLevel: 'warn',
        handler: async ({ setStatus }): Promise<HealthResponse> => {
          if (await database.ping()) return { status: 'ok', database: 'up' };
          setStatus(503);
          return { status: 'degraded', database: 'down' };
        },
      }),
      defineRoute({
        method: 'GET',
        url: '/api/features',
        access: 'public',
        response: enabledFeaturesResponse,
        handler: () => ({ enabled: enabledFeatures }),
      }),
    ],
  });
}

export function buildApp({
  database,
  logger = false,
  features = [],
  enabledFeatures = [],
  authorize = denyAll,
  auth,
  publicUrl = 'http://localhost:5173',
  requestsPerMinute = 600,
  authRequestsPerMinute = 120,
  trustProxy = '',
}: AppOptions): FastifyInstance {
  const app = Fastify({
    logger,
    bodyLimit: MAX_BODY_BYTES,
    ...(trustProxy ? { trustProxy } : {}),
    genReqId: (request) => requestId(request.headers[REQUEST_ID_HEADER]),
  });

  app.decorate('declaredRoutes', []);

  app.addHook('onRoute', (route: RouteOptions) => {
    if (!route.config?.declaredRoute) {
      throw new Error(
        `${String(route.method)} ${route.url} must be added through defineRoute, in a feature.`,
      );
    }
  });

  app.addHook('onRequest', (request, reply, done) => {
    // Awaiting a reply waits for the whole response, so this must not be awaited.
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  // Browsers send Origin on requests that change things, so another site can't act as you.
  const expectedOrigin = new URL(publicUrl).origin;
  app.addHook('onRequest', (request, _reply, done) => {
    const { origin, cookie } = request.headers;
    const isForeign = origin ? origin !== expectedOrigin : Boolean(cookie);
    if (!SAFE_METHODS.has(request.method) && isForeign) {
      done(new AppError(403, 'bad_origin', 'That request came from another site.'));
      return;
    }
    done();
  });

  registerErrorHandling(app);

  // A general limit for every route, stricter ones for sign-in are in core/auth. This counts by
  // the client address Fastify works out, so forged forwarding headers can't get around it.
  void app.register(rateLimit, {
    global: true,
    max: requestsPerMinute,
    timeWindow: '1 minute',
    // Docker's health check calls this every few seconds.
    allowList: (request) => request.url === HEALTH_URL,
  });

  const all = [coreFeature(database, enabledFeatures), ...features];
  const names = all.map((feature) => feature.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) throw new Error(`Two features are named "${duplicate}".`);

  const unknown = enabledFeatures.find((name) => !names.includes(name));
  if (unknown) throw new Error(`ENABLED_FEATURES names "${unknown}", which doesn't exist.`);

  // Routes are added once the rate limit plugin has loaded, so that every one of them gets it.
  app.after(() => {
    if (auth) {
      registerAuthRoutes(app, { ...auth, publicUrl, requestsPerMinute: authRequestsPerMinute });
    }

    for (const feature of all) {
      if (feature.flagged && !enabledFeatures.includes(feature.name)) continue;
      for (const route of feature.routes({ database } as FeatureDependencies)) {
        app.declaredRoutes.push(route);
        app.route({
          method: route.method,
          url: route.url,
          config: { declaredRoute: true },
          ...(route.logLevel ? { logLevel: route.logLevel } : {}),
          handler: (request, reply) => route.run(request, reply, authorize),
        });
      }
    }
  });

  return app;
}
