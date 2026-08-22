/**
 * One error shape for the entire API.
 *
 * Every failure the client can see comes back as:
 *   { "error": { "code": "forbidden", "message": "...", "details"?: ... } }
 *
 * The UI renders `message` directly, so messages are written for humans rather
 * than for logs. Kept free of any Next.js import so the domain layer (and its
 * tests) can throw these without pulling in the web framework.
 */

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export const unauthenticated = (m = 'Please sign in to continue.') => new ApiError('unauthenticated', m);
export const forbidden = (m = 'You do not have access to this document.') => new ApiError('forbidden', m);
export const notFound = (m = 'Not found.') => new ApiError('not_found', m);
export const invalid = (m: string, details?: unknown) => new ApiError('invalid_request', m, details);
export const conflict = (m: string, details?: unknown) => new ApiError('conflict', m, details);
