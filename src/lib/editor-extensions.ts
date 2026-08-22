/**
 * The editor schema.
 *
 * Kept small on purpose: every node type here is one the server can validate
 * (richtext.ts), one the importer can produce, and one the Markdown/HTML
 * exporters can round-trip. Adding a node means touching all four - which is
 * exactly the friction that stops the schema drifting.
 */

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { ALLOWED_HEADING_LEVELS } from './richtext';

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [...ALLOWED_HEADING_LEVELS] },
    // No link support in this scope - see README "What I did not build".
    codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
  }),
  Underline,
  Placeholder.configure({ placeholder: 'Start writing, or import a file…' }),
];
