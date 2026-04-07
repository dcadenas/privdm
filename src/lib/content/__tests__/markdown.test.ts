import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  it('renders plain text without wrapping in p tags', () => {
    expect(renderMarkdown('hello world')).toBe('hello world');
  });

  it('renders **bold** as strong', () => {
    expect(renderMarkdown('hello **world**')).toBe('hello <strong>world</strong>');
  });

  it('renders *italic* as em', () => {
    expect(renderMarkdown('hello *world*')).toBe('hello <em>world</em>');
  });

  it('renders ~~strikethrough~~ as del', () => {
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
    const result = renderMarkdown('***both***');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
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

  it('strips script tags from output', () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain('<script');
  });

  it('strips formatting newlines between block-level tags', () => {
    const result = renderMarkdown('- item1\n- item2');
    expect(result).not.toMatch(/>\n+</);
    expect(result).toContain('<li>');
    expect(result).toContain('item1');
    expect(result).toContain('item2');
  });

  it('strips formatting newlines between paragraphs', () => {
    const result = renderMarkdown('para1\n\npara2');
    expect(result).not.toMatch(/>\n+</);
    expect(result).toContain('para1');
    expect(result).toContain('para2');
  });

  it('preserves newlines inside text content', () => {
    const result = renderMarkdown('line1\nline2');
    expect(result).toContain('line1\nline2');
  });
});
