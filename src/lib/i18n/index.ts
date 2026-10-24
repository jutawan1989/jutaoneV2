import { en, type Dictionary } from "./dictionaries/en";
import { ms } from "./dictionaries/ms";
import { id } from "./dictionaries/id";
import type { Locale } from "./config";

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ms, id };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

export { en, ms, id };
export type { Dictionary };
