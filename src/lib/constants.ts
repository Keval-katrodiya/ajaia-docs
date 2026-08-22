/** Shared limits. Referenced by the API, the UI copy, and the README. */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_TITLE_LENGTH = 200;
export const MAX_DOC_BYTES = 2 * 1024 * 1024; // ~2 MB of ProseMirror JSON

/**
 * Import formats. Deliberately a short list: each one has a tested conversion
 * path into our editor schema. Anything else is rejected with a clear message
 * rather than silently mangled.
 */
export const ACCEPTED_IMPORT_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;

export const ACCEPTED_IMPORT_LABEL = '.txt, .md, .docx';

export const SESSION_COOKIE = 'ajaia_session';

/** Autosave debounce on the client, in ms. */
export const AUTOSAVE_DEBOUNCE_MS = 800;
