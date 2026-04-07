import { micromark } from 'micromark';
import {
  gfmStrikethrough,
  gfmStrikethroughHtml,
} from 'micromark-extension-gfm-strikethrough';

const DANGEROUS_TAG =
  /<\/?(script|iframe|style|object|embed|form|input|button)[^>]*>/gi;

export function renderMarkdown(text: string): string {
  if (!text) return '';

  const html = micromark(text, {
    extensions: [gfmStrikethrough()],
    htmlExtensions: [gfmStrikethroughHtml()],
    allowDangerousHtml: false,
  });

  let result = html.replace(DANGEROUS_TAG, '').trim();

  // Strip formatting newlines between HTML tags. Micromark inserts \n between
  // block-level elements (e.g. </li>\n<li>, <ul>\n<li>). With the parent's
  // whitespace-pre-wrap these would render as visible line breaks.
  result = result.replace(/>\n+</g, '><');

  // Remove outer <p>...</p> wrapper if the entire output is a single paragraph
  if (result.startsWith('<p>') && result.endsWith('</p>')) {
    const inner = result.slice(3, -4);
    if (!inner.includes('<p>') && !inner.includes('</p>')) {
      result = inner;
    }
  }

  // Disable headings: convert <hN> back to text with # prefix
  result = result.replace(
    /<h([1-6])>(.*?)<\/h\1>/g,
    (_m, level, content) => '#'.repeat(Number(level)) + ' ' + content,
  );

  // Disable images (handled by existing segment pipeline)
  result = result.replace(/<img[^>]*\/?>/g, '');

  // Disable links (handled by existing segment pipeline)
  result = result.replace(/<a[^>]*>(.*?)<\/a>/g, '$1');

  return result;
}
