export interface TextPart {
  text: string;
  href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]]/gi;

/** Splits message text into plain parts and links, so links render as anchors without innerHTML. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ text: match[0], href: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;

/** Short messages made only of emoji are shown bigger, like in most chat apps. */
export function isJumboEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /^[\d#*\s]+$/.test(trimmed) || !EMOJI_ONLY.test(trimmed)) return false;
  const glyphs = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
    .map((part) => part.segment)
    .filter((segment) => segment.trim());
  return glyphs.length <= 3;
}
