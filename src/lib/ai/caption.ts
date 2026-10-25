/**
 * Caption text normalisation shared by every provider, so the output rules are
 * enforced in one place instead of drifting per adapter.
 */

/**
 * Linda's call: emoji stay, because the audience posts on TikTok and Facebook
 * and emoji lift click-through. Three is the ceiling — past that a caption
 * reads like spam and the feed truncates it.
 */
export const MAX_CAPTION_EMOJI = 3;

/**
 * Matches one emoji "cluster" rather than one code point, so a flag, a skin
 * tone or a ZWJ family counts as one emoji and is never split in half:
 *   - regional-indicator pairs (flags)
 *   - keycaps (0️⃣)
 *   - pictographs with variation selector, skin tone and ZWJ chains
 */
const EMOJI_CLUSTER =
  /(?:\p{RI}\p{RI})|(?:[0-9#*]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)/gu;

/** Counts emoji clusters, not code points. */
export function countEmoji(text: string): number {
  return [...text.matchAll(EMOJI_CLUSTER)].length;
}

/**
 * Drops emoji beyond `max`, keeping the first ones where the model put them.
 * The prompt asks for the limit; this makes it a guarantee.
 */
export function capEmoji(text: string, max: number = MAX_CAPTION_EMOJI): string {
  const matches = [...text.matchAll(EMOJI_CLUSTER)];
  if (matches.length <= max) return text;

  let out = text;
  // Back to front, so earlier match offsets stay valid.
  for (let index = matches.length - 1; index >= max; index -= 1) {
    const match = matches[index];
    const start = match.index ?? 0;
    out = out.slice(0, start) + out.slice(start + match[0].length);
  }

  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Strips the wrappers a model sometimes adds around a single caption, enforces
 * the emoji ceiling and the length ceiling.
 */
export function normalizeCaption(
  raw: string,
  options: { maxEmoji?: number; maxChars?: number } = {},
): string {
  const { maxEmoji = MAX_CAPTION_EMOJI, maxChars = 400 } = options;

  let text = raw.trim();
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/```$/i, "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/\n{3,}/g, "\n\n");
  // Cap before truncating, so the cap cannot be defeated by the length cut.
  text = capEmoji(text, maxEmoji);

  return text.slice(0, maxChars).trim();
}
