import { getSupabase } from "@/lib/db";
import type { EventInput } from "./types";

export {
  ANALYTICS_EVENTS,
  UTM_KEYS,
  isAnalyticsEvent,
  parseUtm,
  type AnalyticsEvent,
  type EventInput,
  type UtmParams,
} from "./types";

/**
 * Persists an event to Supabase. Logging must never break a user flow, so all
 * failures are swallowed after being reported.
 */
export async function logEvent(input: EventInput): Promise<void> {
  const db = getSupabase();
  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[jutaone] event", input.event, {
        locale: input.locale,
        region: input.region,
        variant: input.variant,
        utm: input.utm,
      });
    }
    return;
  }

  const { error } = await db.from("events").insert({
    name: input.event,
    locale: input.locale,
    region: input.region,
    variant: input.variant,
    utm: input.utm ?? {},
    visitor_key: input.visitorKey ?? null,
    props: input.props ?? {},
  });

  if (error) {
    console.error("[jutaone] event insert failed", input.event, error.message);
  }
}
