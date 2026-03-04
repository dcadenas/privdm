# Markdown Rendering in Chat Messages

## Overview

Render inline markdown in DM messages using micromark (~6KB gzip).

## Scope

Chat-focused inline formatting only:
- **bold** (`**text**` / `__text__`)
- *italic* (`*text*` / `_text_`)
- ~~strikethrough~~ (`~~text~~`) via gfm-strikethrough extension
- `inline code`
- Fenced code blocks

No headings, tables, images, or block-level elements.

## Integration

- Library: `micromark` + `micromark-extension-gfm-strikethrough`
- Integration point: `MessageContent.tsx` text segments only
- Existing URL/nostr/media segments unchanged
- micromark converts text → HTML, rendered via `dangerouslySetInnerHTML`
- Sanitize output as safeguard (strip script/iframe/style tags)

## Styling

Tailwind classes via a CSS scope on the markdown wrapper:
- `strong` → `font-semibold`
- `em` → `italic`
- `del` → `line-through`
- `code` (inline) → monospace, subtle bg contrast
- `pre > code` → dark bg, horizontal scroll

Color-aware: `isMine` (amber bubble) vs theirs (gray bubble) get different code backgrounds.

## Security

micromark doesn't output raw HTML by default. Additional safeguard: strip dangerous tags post-parse.

## Constraints

- Don't parse markdown inside URLs or nostr entities
- Don't render headings — pass through as text
- Avoid wrapping in `<p>` tags (already using `whitespace-pre-wrap`)
