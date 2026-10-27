import type { Locale, Region } from "@/lib/i18n/config";

export type CaptionRequest = {
  /** What the merchant sells, max 200 characters. */
  text: string;
  locale: Locale;
  region: Region;
};

export type CaptionResult = {
  caption: string;
  /**
   * `mock-fallback` = a provider was configured but failed or timed out.
   * `mock` = no provider configured at all, so the local template ran directly.
   */
  source: "deepseek" | "groq" | "openai" | "openrouter" | "meta" | "mock" | "mock-fallback";
  model: string;
  costUsd: number;
  latencyMs: number;
};

const OUTPUT_LANGUAGE: Record<Locale, string> = {
  en: "English",
  ms: "Bahasa Melayu (Malaysian spelling and phrasing)",
  id: "Bahasa Indonesia",
};

const MARKET: Record<Region, string> = {
  MY: "Malaysia",
  ID: "Indonesia",
  OTHER: "Southeast Asia",
};

/**
 * Compliance rule: the model must never promise profit, earnings or financial
 * returns, and must not give investment advice.
 */
export const SYSTEM_PROMPT = `You write short marketing captions for small merchants in {market}.

Rules:
- Write in {language}. Natural, casual, spoken by a real shop owner.
- One caption for TikTok or Facebook. Maximum 240 characters.
- Start with a hook, then one concrete detail from the merchant's text, then a call to action.
- End with 2 or 3 relevant hashtags.
- Emoji are welcome and should feel native to social media, but use no more than 3 in the whole caption. Zero is fine.
- Never invent prices, discounts, stock numbers or claims that are not in the merchant's text.
- Never promise profit, income, earnings, guaranteed results, risk-free outcomes, or financial returns.
- Never give financial, investment, gold or silver trading advice.
- Output the caption only. No quotes, no labels, no markdown, no explanation.`;

export function buildSystemPrompt(locale: Locale, region: Region): string {
  return SYSTEM_PROMPT.replace("{market}", MARKET[region]).replace(
    "{language}",
    OUTPUT_LANGUAGE[locale],
  );
}

export function buildUserPrompt(text: string): string {
  return `Merchant's product: ${text}\n\nWrite the caption.`;
}
