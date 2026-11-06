import type { Database } from '@remidy/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { AppError } from './errors.ts';

/**
 * Who may call a route. Every route must say so.
 * `public` needs no sign-in, and adding one means updating the list in permissions.test.ts.
 */
export type Access = 'public' | 'signed-in';

/** The signed-in person a request belongs to. */
export interface Principal {
  userId: string;
  email: string;
  name: string;
  isInstanceAdmin: boolean;
}

export type Authorize = (
  access: Exclude<Access, 'public'>,
  request: FastifyRequest,
) => Promise<Principal>;

/** Until sign-in exists, anything that isn't public is refused. */
export const denyAll: Authorize = () =>
  Promise.reject(new AppError(401, 'not_signed_in', 'Sign in to continue.'));

interface RouteContext<Params, Query, Body, A extends Access> {
  params: Params;
  query: Query;
  body: Body;
  /** Who is calling. Routes that aren't public always have one. */
  user: A extends 'public' ? null : Principal;
  /** Changes the status code of a successful response. */
  setStatus: (code: number) => void;
  request: FastifyRequest;
}

interface RouteDefinition<Params, Query, Body, Response, A extends Access> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: `/api/${string}`;
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
  return {
    method: definition.method,
    url: definition.url,
    access: definition.access,
    ...(definition.logLevel ? { logLevel: definition.logLevel } : {}),
    async run(request, reply, authorize) {
      // Check access first, so a caller without it learns nothing from validation errors.
      const user =
        definition.access === 'public' ? null : await authorize(definition.access, request);
      let status = definition.status ?? 200;
      const result = await definition.handler({
        params: parseInput(definition.params, request.params, 'params'),
        query: parseInput(definition.query, request.query, 'query'),
        body: parseInput(definition.body, request.body, 'body'),
        user: user as RouteContext<Params, Query, Body, A>['user'],
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

export interface Feature {
  name: string;
  /** A flagged feature stays off unless named in the ENABLED_FEATURES setting. */
  flagged?: boolean;
  routes(dependencies: FeatureDependencies): Route[];
}

export function defineFeature(feature: Feature): Feature {
  return feature;
}
