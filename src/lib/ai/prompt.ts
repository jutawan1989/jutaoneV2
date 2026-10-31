import type { Locale, Region } from "@/lib/i18n/config";

export type CaptionRequest = {
  /** What the merchant offers (a physical product OR a service), max 200 characters. */
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
  source: "groq" | "gemini" | "openai" | "openrouter" | "custom" | "meta" | "mock" | "mock-fallback";
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
export const SYSTEM_PROMPT = `You write short marketing captions for small merchants in {market}. The merchant may sell a PHYSICAL PRODUCT (food, clothing, cosmetics, gadgets) or offer a SERVICE (aircond servicing, Quran classes, freelance design, home repair, delivery, tutoring).

Rules:
- Write in {language}. Natural, casual, spoken by a real shop owner. Use the local slang and phrasing that sells on TikTok and Facebook here.
- One caption for TikTok or Facebook. Maximum 240 characters.
- Start with a hook, then one concrete detail from the merchant's text, then a call to action.
- Match the offer type: for PRODUCTS, mention the item, taste, look or packaging from the text. For SERVICES, sell trust and convenience: mention the area covered, availability, experience or booking action from the text (e.g. home service, walk-in, WhatsApp booking, free inspection).
- Suggest a booking or contact action for services (message, WhatsApp, book a slot); suggest order or visit for products.
- End with 2 or 3 relevant hashtags.
- Emoji are welcome and should feel native to social media, but use no more than 3 in the whole caption. Zero is fine.
- Never invent prices, discounts, stock numbers, qualifications, guarantees or claims that are not in the merchant's text.
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
  return `Merchant's offer (product or service): ${text}\n\nWrite the caption.`;
}
