import { COMPLIANCE_DISCLAIMER_EN } from "@/lib/compliance";

export const en = {
  meta: {
    title: "JutaOne.Biz — AI ad captions for small merchants",
    description:
      "Turn one sentence about your product into a TikTok or Facebook caption in Malay, Indonesian or English — in seconds. Pay per token, no subscription.",
  },
  nav: {
    demo: "Live demo",
    gold: "Gold widget",
    pricing: "Token pricing",
    cta: "Start with {price}",
    languageLabel: "Language",
  },
  hero: {
    eyebrow: "AI ad engine for small merchants",
    title: "A moving billboard",
    titleAccent: "for your business",
    subtitle:
      "Type what you sell. Get a scroll-stopping TikTok or Facebook caption in seconds — no agency, no copywriter, no account.",
    ctaPrimary: "Try the free demo",
    ctaSecondary: "See token pricing",
    stats: [
      { value: "Seconds", label: "Average caption time" },
      { value: "3 languages", label: "Malay, Indonesian, English" },
      { value: "No signup", label: "Demo works without an account" },
    ],
  },
  billboard: {
    label: "Live examples",
    cards: [
      "Nasi lemak sambal petai — still hot at 7am.",
      "Hand-baked butter cookies. One jar disappears fast.",
      "Kopi susu gula aren, angkat pagi, senyum sampai tengah hari.",
      "Phone repair while you wait. Screen done in 20 minutes.",
      "Kek lapis Sarawak — order today, pick up tomorrow.",
    ],
  },
  generator: {
    title: "Try it now",
    subtitle:
      "Two free captions per visitor. No email, no phone number, no account — nothing to fill in.",
    label: "Type what you sell",
    placeholder: "Example: Hand-baked butter cookies, RM25 a jar, delivery in Klang Valley.",
    hint: "Max 200 characters. Include your price and area for a sharper caption.",
    submit: "Write my caption",
    generating: "Writing...",
    remaining: "{count} free demo left",
    remainingPlural: "{count} free demos left",
    limitBadge: "Free demos used: {count}/{max}",
    outputLabel: "Your caption",
    copy: "Copy",
    copied: "Copied",
    regenerateHint: "Not quite right? Edit your text and try again while demos last.",
    errorGeneric: "Something went wrong. Please try again in a moment.",
    errorLimit: "Your free demos are used up. Top up to keep going.",
    errorBlocked: "The demo is paused for today. You can still top up.",
    errorTooShort: "Please write at least 5 characters.",
  },
  gold: {
    title: "Gold & silver signal widget",
    subtitle:
      "A phone-sized preview of the widget you can place on your business page. Animated and easy to read at a glance.",
    screenTitle: "Market signals",
    priceRow: "Signal · 24h window",
    disclaimer: COMPLIANCE_DISCLAIMER_EN,
    note: "All figures and signals shown here are simulated. They do not reflect real market data or real performance.",
    signals: {
      buy: "BUY",
      sell: "SELL",
      hold: "HOLD",
    },
    instruments: {
      gold: "Gold 999",
      silver: "Silver 925",
    },
  },
  pricing: {
    title: "Token only. Nothing hidden.",
    subtitle: "One top-up, one balance. No monthly fee, no contract.",
    tokenName: "1 Million Tokens",
    priceLabel: "Total",
    baseLabel: "Base price",
    localApprox: "≈ {local} at today's rate",
    cta: "Top up with FPX or card",
    bullets: [
      "Three languages: Malay, Indonesian, English",
      "Captions for TikTok and Facebook",
      "No subscription, no auto-renewal",
      "Pay only when you are ready",
    ],
    topupNote: "Payments are handled by Chip.Asia. You pay in {currency}.",
  },
  hook: {
    close: "Maybe later",
    dismissLabel: "Close",
    variantA: {
      label: "Get your tokens",
      title: "Nice, right?",
      body: "Start automating your business today for just {price}. That is {tokenName} in your account, ready to use.",
      cta: "Top up {price} now",
      note: "No subscription. No contract. Prices stay in {currency}.",
    },
    variantB: {
      label: "Stop starting from blank",
      title: "Never start from a blank caption again",
      body: "Every product you sell gets a caption ready to publish — in three languages, in seconds. One top-up of {price} keeps it running.",
      cta: "Get my {tokenName}",
      note: "No subscription. No contract. Prices stay in {currency}.",
    },
  },
  topup: {
    title: "Top up your balance",
    subtitle: "Sandbox mode — no real payment will be taken.",
    amount: "Amount",
    tokens: "Tokens",
    status: "Status",
    statusPending: "Waiting for provider confirmation",
    statusMock: "Payment provider not configured yet",
    back: "Back to the demo",
    finish: "Simulate successful payment",
    finished: "Sandbox payment recorded. Thanks — your balance would now be {tokenName}.",
  },
  compliance: {
    disclaimer:
      "JutaOne.Biz helps small merchants write better ads. We are not financial or investment advisers. The gold and silver widget is a simulation shown for demonstration only.",
    noGuarantee: "We make no promise of profit, earnings or financial return.",
  },
  footer: {
    tagline: "AI ad copy for small merchants in Malaysia and Indonesia.",
    rights: "© {year} JutaOne.Biz. All rights reserved.",
  },
  a11y: {
    skipToContent: "Skip to content",
    globeLabel: "Spinning globe",
  },
};

/** Shape every locale must satisfy. Widened on purpose so `ms`/`id` are not
 * restricted to the English string literals. */
export type Dictionary = typeof en;
