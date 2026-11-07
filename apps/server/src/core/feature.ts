import type { Database } from '@remidy/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { AppError } from './errors.ts';

export type SpaceRole = 'member' | 'manager' | 'owner';

/**
 * Who may call a route. Every route must say so.
 * `public` needs no sign-in, and adding one means updating the list in permissions.test.ts.
 * `{ space: role }` needs :spaceId in the URL, and at least that role in that space.
 * `instance-admin` manages the instance, and gives no access to anyone's space.
 */
export type Access = 'public' | 'signed-in' | 'instance-admin' | { space: SpaceRole };

/** The signed-in person a request belongs to. */
export interface Principal {
  userId: string;
  email: string;
  name: string;
  isInstanceAdmin: boolean;
}

/** The space a request is about, once the caller's role in it has been checked. */
export interface SpaceAccess {
  id: string;
  role: SpaceRole;
}

export interface Authorized {
  user: Principal;
  space: SpaceAccess | null;
}

export type Authorize = (
  access: Exclude<Access, 'public'>,
  request: FastifyRequest,
) => Promise<Authorized>;

/** Until sign-in exists, anything that isn't public is refused. */
export const denyAll: Authorize = () =>
  Promise.reject(new AppError(401, 'not_signed_in', 'Sign in to continue.'));

interface RouteContext<Params, Query, Body, A extends Access> {
  params: Params;
  query: Query;
  body: Body;
  /** Who is calling. Routes that aren't public always have one. */
  user: A extends 'public' ? null : Principal;
  /** The space in the URL. Space routes always have one, and every query must be scoped to it. */
  space: A extends { space: SpaceRole } ? SpaceAccess : null;
  /** Changes the status code of a successful response. */
  setStatus: (code: number) => void;
  request: FastifyRequest;
}

interface RouteDefinition<Params, Query, Body, Response, A extends Access> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Under the API version. The health check is the only exception, because it describes the
   * server rather than the API, and Docker and proxies shouldn't depend on the version. */
  url: `/api/v1/${string}` | '/api/health';
  access: A;
  params?: z.ZodType<Params>;
  query?: z.ZodType<Query>;
  body?: z.ZodType<Body>;
  /** What the route returns. Fields not listed here never reach the client. */
  response: z.ZodType<Response>;
  /** The default status code. */
  status?: number;
  logLevel?: 'warn';
  handler(context: RouteContext<Params, Query, Body, A>): Promise<Response> | Response;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  access: Access;
  logLevel?: 'warn';
  run(request: FastifyRequest, reply: FastifyReply, authorize: Authorize): Promise<unknown>;
}

function parseInput<T>(schema: z.ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // Zod's messages describe the rule, and don't repeat what was sent.
  throw new AppError(
    422,
    'validation_failed',
    'Check the highlighted fields and try again.',
    result.error.issues.map((issue) => ({
      path: [where, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  );
}

/** The only way to add a route. It can't exist without its schemas and access rule. */
export function defineRoute<
  Params = undefined,
  Query = undefined,
  Body = undefined,
  Response = unknown,
  A extends Access = Access,
>(definition: RouteDefinition<Params, Query, Body, Response, A>): Route {
  const { access } = definition;
  if (typeof access === 'object' && !definition.url.includes(':spaceId')) {
    throw new Error(`${definition.url} needs :spaceId in its URL to check space access.`);
  }
  return {
    method: definition.method,
    url: definition.url,
    access: definition.access,
    ...(definition.logLevel ? { logLevel: definition.logLevel } : {}),
    async run(request, reply, authorize) {
      // Check access first, so a caller without it learns nothing from validation errors.
      const authorized = access === 'public' ? null : await authorize(access, request);
      let status = definition.status ?? 200;
      const result = await definition.handler({
        params: parseInput(definition.params, request.params, 'params'),
        query: parseInput(definition.query, request.query, 'query'),
        body: parseInput(definition.body, request.body, 'body'),
        user: (authorized?.user ?? null) as RouteContext<Params, Query, Body, A>['user'],
        space: (authorized?.space ?? null) as RouteContext<Params, Query, Body, A>['space'],
        setStatus: (code) => {
          status = code;
        },
        request,
      });
      if (status === 204) {
        return reply.code(204).send();
      }
      return reply.code(status).send(definition.response.parse(result));
    },
  };
}

export interface FeatureDependencies {
  database: Database;
}

/** Work that runs on a schedule. It's retried if it fails, so it must be safe to run again. */
export interface Job {
  /** Letters, numbers and dashes. */
  name: string;
  /** Shown to instance admins, so it must make sense to a person. */
  description: string;
  /** When to run, in UTC, such as `17 * * * *` for 17 minutes past each hour. */
  cron: string;
  /** How often that is, so that a job that has stopped running can be noticed. */
  everyMinutes: number;
  run: () => Promise<void>;
}

/** Where a feature puts its sample data. */
export interface SampleContext {
  /** The admin, who owns the sample data. */
  userId: string;
  personalSpaceId: string;
  /** A sample household the admin owns, with a made-up second member. */
  householdId: string;
  /** Replace this feature's sample data rather than keeping what's there. */
  fresh: boolean;
}

export interface Feature {
  name: string;
  /** A flagged feature stays off unless named in the ENABLED_FEATURES setting. */
  flagged?: boolean;
  routes(dependencies: FeatureDependencies): Route[];
  jobs?(dependencies: FeatureDependencies): Job[];
  /**
   * Adds fictional data for development, through the feature's own code, and says what it added.
   * Must be safe to run again, and only replace its own sample data when asked to.
   */
  sampleData?(dependencies: FeatureDependencies, context: SampleContext): Promise<string>;
}

export function defineFeature(feature: Feature): Feature {
  return feature;
}
