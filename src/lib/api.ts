/**
 * HTTP plumbing for route handlers. The error *types* live in errors.ts so the
 * domain layer can throw them without importing Next; this file only turns
 * them into responses.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, invalid } from './errors';

export * from './errors';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details } },
    { status: error.status },
  );
}

/**
 * Wraps a route handler so no handler needs its own try/catch. Zod failures
 * become 400s with field-level detail; anything else is logged server-side and
 * returned as a generic 500 - stack traces never cross the wire.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse | Response>,
): (...args: Args) => Promise<NextResponse | Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);

      if (error instanceof ZodError) {
        const first = error.issues[0];
        return errorResponse(
          invalid(
            first ? `${first.path.join('.') || 'request'}: ${first.message}` : 'Invalid request.',
            error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      }

      console.error('[api] unhandled error', error);
      return errorResponse(new ApiError('internal', 'Something went wrong on our end.'));
    }
  };
}
