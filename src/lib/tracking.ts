/**
 * Ad-pixel snippet builders (Lead Ads foundation — Xiana's blueprint).
 *
 * Pure functions, no JSX: unit-tested in `tests/tracking-pixels.test.ts`.
 * IDs are validated before interpolation — env values must never become an
 * injection vector. Each vendor only renders when its ID is present, so an
 * empty env means zero third-party requests.
 */

export type TrackingIds = {
  meta: string | null;
  tiktok: string | null;
  linkedin: string | null;
  x: string | null;
};

function cleanId(value: string | undefined): string | null {
  if (!value) return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** Reads the four `NEXT_PUBLIC_*` IDs Boss will supply later. */
export function trackingPixelIds(env: NodeJS.ProcessEnv = process.env): TrackingIds {
  return {
    meta: cleanId(env.NEXT_PUBLIC_META_PIXEL_ID),
    tiktok: cleanId(env.NEXT_PUBLIC_TIKTOK_PIXEL_ID),
    linkedin: cleanId(env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID),
    x: cleanId(env.NEXT_PUBLIC_X_PIXEL_ID),
  };
}

export type TrackingSnippet = {
  /** Stable <script> id. */
  id: string;
  /** Inline script body. */
  html: string;
  /** No-JS fallback image (Meta only). */
  noscriptImg: string | null;
};

/** Inline bodies for every configured vendor, in render order. */
export function trackingSnippets(ids: TrackingIds): TrackingSnippet[] {
  const out: TrackingSnippet[] = [];
  if (ids.meta) {
    out.push({
      id: "meta-pixel",
      html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.meta}');fbq('track','PageView');`,
      noscriptImg: `https://www.facebook.com/tr?id=${ids.meta}&ev=PageView&noscript=1`,
    });
  }
  if (ids.tiktok) {
    out.push({
      id: "tiktok-pixel",
      html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq,i=e.length;i--;){if(e[i].pixelId===t)return e[i]}};ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=n,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=[],ttq._partition=ttq._partition||"AE";var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${ids.tiktok}');ttq.page();}(window,document,'ttq');`,
      noscriptImg: null,
    });
  }
  if (ids.linkedin) {
    out.push({
      id: "linkedin-pixel",
      html: `_linkedin_partner_id="${ids.linkedin}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`,
      noscriptImg: null,
    });
  }
  if (ids.x) {
    out.push({
      id: "x-pixel",
      html: `!function(e,t,n,s,u,a){e.twq||((s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a)))}(window,document,'script');twq('config','${ids.x}');`,
      noscriptImg: null,
    });
  }
  return out;
}
