# Markdown Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render inline markdown (bold, italic, strikethrough, inline code, code blocks) in chat message text segments using micromark.

**Architecture:** The existing `parseContent()` splits messages into segments (text, URL, nostr, media). A new `renderMarkdown()` function converts text segment strings to sanitized HTML via micromark. `MessageContent.tsx` renders text segments with `dangerouslySetInnerHTML` instead of plain text. Scoped CSS handles styling for both bubble colors.

**Tech Stack:** micromark, micromark-extension-gfm-strikethrough, vitest

---

### Task 1: Install micromark

**Step 1: Install dependencies**

Run: `npm install micromark micromark-extension-gfm-strikethrough`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add micromark for markdown rendering"
```

---

### Task 2: Create renderMarkdown utility with tests

**Files:**
- Create: `src/lib/content/markdown.ts`
- Create: `src/lib/content/__tests__/markdown.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/content/__tests__/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  it('renders plain text without wrapping in <p> tags', () => {
    expect(renderMarkdown('hello world')).toBe('hello world');
  });

  it('renders **bold** as <strong>', () => {
    expect(renderMarkdown('hello **world**')).toBe('hello <strong>world</strong>');
  });

  it('renders *italic* as <em>', () => {
    expect(renderMarkdown('hello *world*')).toBe('hello <em>world</em>');
  });

  it('renders ~~strikethrough~~ as <del>', () => {
    expect(renderMarkdown('hello ~~world~~')).toBe('hello <del>world</del>');
  });

  it('renders `inline code`', () => {
    expect(renderMarkdown('use `npm install`')).toBe('use <code>npm install</code>');
  });

  it('renders fenced code blocks', () => {
    const input = '```\nconst x = 1;\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('<pre><code>');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('</code></pre>');
  });

  it('renders fenced code blocks with language', () => {
    const input = '```js\nconst x = 1;\n```';
    const result = renderMarkdown(input);
    expect(result).toContain('<code class="language-js">');
  });

  it('handles nested bold and italic', () => {
    expect(renderMarkdown('***both***')).toContain('<strong><em>both</em></strong>');
  });

  it('preserves newlines in non-code text', () => {
    const result = renderMarkdown('line1\nline2');
    expect(result).toContain('line1\nline2');
  });

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('does not render headings — passes # through as text', () => {
    const result = renderMarkdown('# hello');
    expect(result).not.toContain('<h1>');
    expect(result).toContain('# hello');
  });

  it('does not render images', () => {
    const result = renderMarkdown('![alt](http://example.com/img.png)');
    expect(result).not.toContain('<img');
  });

  it('does not render links (handled by existing parser)', () => {
    const result = renderMarkdown('[click](http://example.com)');
    expect(result).not.toContain('<a');
  });

  it('strips <script> tags from output', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/content/__tests__/markdown.test.ts`
Expected: FAIL — module `../markdown` does not exist

**Step 3: Implement renderMarkdown**

```typescript
// src/lib/content/markdown.ts
import { micromark } from 'micromark';
import { gfmStrikethrough, gfmStrikethroughHtml } from 'micromark-extension-gfm-strikethrough';

const DANGEROUS_TAG = /<\/?(script|iframe|style|object|embed|form|input|button)[^>]*>/gi;

export function renderMarkdown(text: string): string {
  if (!text) return '';

  const html = micromark(text, {
    extensions: [gfmStrikethrough()],
    htmlExtensions: [gfmStrikethroughHtml()],
    allowDangerousHtml: false,
  });

  // Strip wrapping <p>...</p> for inline use (single paragraph)
  // Also strip dangerous tags as belt-and-suspenders
  let result = html
    .replace(DANGEROUS_TAG, '')
    .trim();

  // Remove outer <p>...</p> wrapper if the entire output is a single paragraph
  if (result.startsWith('<p>') && result.endsWith('</p>')) {
    const inner = result.slice(3, -4);
    // Only unwrap if there are no other <p> tags inside
    if (!inner.includes('<p>') && !inner.includes('</p>')) {
      result = inner;
    }
  }

  // Disable headings: convert <hN> back to text with # prefix
  result = result.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_m, level, content) => {
    return '#'.repeat(Number(level)) + ' ' + content;
  });

  // Disable images (handled by existing segment pipeline)
  result = result.replace(/<img[^>]*>/g, '');

  // Disable links (handled by existing segment pipeline)
  result = result.replace(/<a[^>]*>(.*?)<\/a>/g, '$1');

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/content/__tests__/markdown.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/content/markdown.ts src/lib/content/__tests__/markdown.test.ts
git commit -m "feat: add renderMarkdown utility with micromark"
```

---

### Task 3: Integrate markdown rendering into MessageContent

**Files:**
- Modify: `src/components/content/MessageContent.tsx`

**Step 1: Update MessageContent to render markdown in text segments**

Replace the `case 'text'` in `MessageContent.tsx`:

```typescript
// Before:
case 'text':
  return <Fragment key={i}>{seg.value}</Fragment>;

// After:
case 'text':
  return (
    <span
      key={i}
      className={`markdown-inline ${isMine ? 'markdown-mine' : 'markdown-theirs'}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.value) }}
    />
  );
```

Add import at top:
```typescript
import { renderMarkdown } from '@/lib/content/markdown';
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/content/MessageContent.tsx
git commit -m "feat: render markdown in message text segments"
```

---

### Task 4: Add scoped markdown CSS

**Files:**
- Modify: `src/index.css` (or wherever Tailwind base styles live)

**Step 1: Find the CSS entry point**

Check: `src/index.css` or `src/styles/globals.css`

**Step 2: Add scoped markdown styles**

Append to the CSS file:

```css
/* Markdown in chat messages */
.markdown-inline strong { font-weight: 600; }
.markdown-inline em { font-style: italic; }
.markdown-inline del { text-decoration: line-through; }

.markdown-inline code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85em;
  padding: 0.15em 0.35em;
  border-radius: 0.25rem;
}

.markdown-inline pre {
  margin: 0.5em 0;
  border-radius: 0.375rem;
  overflow-x: auto;
}

.markdown-inline pre code {
  display: block;
  padding: 0.6em 0.8em;
  font-size: 0.8em;
  white-space: pre;
}

/* Color variants for bubble types */
.markdown-mine code { background: rgba(0, 0, 0, 0.12); }
.markdown-mine pre { background: rgba(0, 0, 0, 0.15); }
.markdown-mine pre code { background: transparent; }

.markdown-theirs code { background: rgba(255, 255, 255, 0.08); }
.markdown-theirs pre { background: rgba(255, 255, 255, 0.06); }
.markdown-theirs pre code { background: transparent; }
```

**Step 3: Run dev server and visually verify**

Run: `npm run dev`
Send messages with `**bold**`, `*italic*`, `` `code` ``, and code blocks to verify rendering.

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: add scoped CSS for markdown in chat bubbles"
```

---

### Task 5: Run full test suite and typecheck

**Step 1: Run all tests**

Run: `npm test`
Expected: All 299+ tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Push**

```bash
git push
```
