/**
 * Request validation. Every mutating endpoint parses its body through one of
 * these before touching the database.
 */

import { z } from 'zod';
import { MAX_DOC_BYTES, MAX_TITLE_LENGTH } from './constants';

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title cannot be empty.')
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);

/**
 * The document body is validated structurally by sanitizeDoc() in richtext.ts,
 * which is where the schema whitelist lives. Here we only enforce the outer
 * shape and a size ceiling, so a runaway paste cannot fill the disk.
 */
export const docContentSchema = z
  .object({ type: z.literal('doc') })
  .passthrough()
  .refine(
    (value) => JSON.stringify(value).length <= MAX_DOC_BYTES,
    `Document is too large. The limit is ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB of content.`,
  );

export const createDocumentSchema = z.object({
  title: titleSchema.optional(),
  content: docContentSchema.optional(),
});

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    content: docContentSchema.optional(),
    /**
     * Revision the client started from. Sent on content saves so a stale tab
     * cannot silently overwrite a co-editor's work - the server answers 409
     * and the UI prompts a reload. See ARCHITECTURE.md "Concurrent editing".
     */
    baseRev: z.number().int().positive().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.content !== undefined,
    'Provide a title, content, or both.',
  );

export const createShareSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(['viewer', 'editor']).default('editor'),
});

export const updateShareSchema = z.object({
  role: z.enum(['viewer', 'editor']),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
});

export const importModeSchema = z.enum(['new', 'append', 'replace']);
