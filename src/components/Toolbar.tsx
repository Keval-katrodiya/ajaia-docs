'use client';

import type { Editor } from '@tiptap/react';

/**
 * Formatting controls.
 *
 * Scope note: bold / italic / underline / H1-H3 / bulleted + numbered lists are
 * the assignment's required set. Quote, inline code and the divider came free
 * with the StarterKit schema, so they are exposed rather than hidden. Anything
 * that needs its own UI surface - links, tables, images, colour - was cut.
 */
export function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;

  const off = disabled;

  return (
    <>
      <Tool
        label="Bold"
        shortcut="Ctrl+B"
        active={editor.isActive('bold')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span style={{ fontWeight: 800 }}>B</span>
      </Tool>

      <Tool
        label="Italic"
        shortcut="Ctrl+I"
        active={editor.isActive('italic')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>I</span>
      </Tool>

      <Tool
        label="Underline"
        shortcut="Ctrl+U"
        active={editor.isActive('underline')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </Tool>

      <Tool
        label="Strikethrough"
        active={editor.isActive('strike')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </Tool>

      <span className="tool-divider" aria-hidden />

      <Tool
        label="Body text"
        wide
        active={editor.isActive('paragraph')}
        disabled={off}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        Body
      </Tool>
      {([1, 2, 3] as const).map((level) => (
        <Tool
          key={level}
          label={`Heading ${level}`}
          wide
          active={editor.isActive('heading', { level })}
          disabled={off}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          H{level}
        </Tool>
      ))}

      <span className="tool-divider" aria-hidden />

      <Tool
        label="Bulleted list"
        active={editor.isActive('bulletList')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <span aria-hidden>•—</span>
      </Tool>

      <Tool
        label="Numbered list"
        active={editor.isActive('orderedList')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <span aria-hidden style={{ fontSize: 12 }}>1.</span>
      </Tool>

      <Tool
        label="Quote"
        active={editor.isActive('blockquote')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <span aria-hidden>❝</span>
      </Tool>

      <Tool
        label="Inline code"
        active={editor.isActive('code')}
        disabled={off}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span aria-hidden style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{'</>'}</span>
      </Tool>

      <span className="tool-divider" aria-hidden />

      <Tool
        label="Undo"
        shortcut="Ctrl+Z"
        disabled={off || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <span aria-hidden>↶</span>
      </Tool>
      <Tool
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        disabled={off || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <span aria-hidden>↷</span>
      </Tool>
    </>
  );
}

function Tool({
  label,
  shortcut,
  active = false,
  disabled,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled: boolean;
  wide?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={wide ? 'tool tool-wide' : 'tool'}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keep the editor selection alive when the button takes focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
