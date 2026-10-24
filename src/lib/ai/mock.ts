import type { Locale } from "@/lib/i18n/config";
import type { CaptionRequest, CaptionResult } from "./prompt";

type Template = { hooks: string[]; ctas: string[]; tags: string[] };

const TEMPLATES: Record<Locale, Template> = {
  ms: {
    hooks: [
      "Baru keluar dari dapur.",
      "Stok terhad, siapa cepat dia dapat.",
      "Ini yang anda cari sebenarnya.",
      "Order dibuka hari ini.",
      "Dibuat cara yang betul, bukan cara cepat.",
    ],
    ctas: [
      "Order sekarang, kami reply laju.",
      "WhatsApp kami untuk tempah.",
      "Tekan pautan di bio.",
      "DM untuk stok hari ini.",
    ],
    tags: ["#peniagakecil", "#jualanonline", "#malaysia"],
  },
  id: {
    hooks: [
      "Baru keluar dari dapur.",
      "Stok terbatas, siapa cepat dia dapat.",
      "Ini yang Anda cari.",
      "Buka order hari ini.",
      "Dibuat dengan cara yang benar, bukan cara cepat.",
    ],
    ctas: [
      "Order sekarang, kami balas cepat.",
      "Chat WhatsApp untuk pesan.",
      "Klik link di bio.",
      "DM untuk stok hari ini.",
    ],
    tags: ["#umkm", "#jualanonline", "#indonesia"],
  },
  en: {
    hooks: [
      "Fresh out of the kitchen.",
      "Limited stock — first come, first served.",
      "This is the one you were looking for.",
      "Orders open today.",
      "Made the way it should be, not the quick way.",
    ],
    ctas: [
      "Order now, we reply fast.",
      "Message us on WhatsApp to order.",
      "Tap the link in bio.",
      "DM us for today's stock.",
    ],
    tags: ["#smallbusiness", "#supportlocal", "#madewithcare"],
  },
};

const MAX_CAPTION = 280;

function pick(list: string[], seed: number): string {
  return list[seed % list.length];
}

function seedFrom(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100_000;
  }
  return hash;
}

/**
 * Local template generator used when `META_AI_API_KEY` is absent (and as a
 * fallback when the provider is slow or failing). Costs nothing, so it does not
 * consume the daily AI budget.
 */
export function generateMockCaption(req: CaptionRequest): CaptionResult {
  const startedAt = Date.now();
  const template = TEMPLATES[req.locale] ?? TEMPLATES.en;
  const seed = seedFrom(req.text);
  const body = req.text.trim().replace(/\s+/g, " ");

  const caption = `${pick(template.hooks, seed)} ${body}\n\n${pick(template.ctas, seed >> 3)}\n${template.tags.join(" ")}`
    .slice(0, MAX_CAPTION)
    .trim();

  return {
    caption,
    source: "mock",
    model: "local-template",
    costUsd: 0,
    latencyMs: Date.now() - startedAt,
  };
}
