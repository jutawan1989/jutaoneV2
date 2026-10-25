import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, detectLocale } from "@/lib/geo";
import { isLocale } from "@/lib/i18n/config";

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|assets|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)",
  ],
};

/**
 * D6 geo-routing: a visitor landing on `/` (or any path without a locale) is
 * redirected to the locale that matches their Cloudflare country. An explicit
 * language switch is remembered in a cookie and wins on later visits.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  if (isLocale(firstSegment)) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      response.cookies.set(LOCALE_COOKIE, firstSegment, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  const locale = detectLocale(request.headers);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url, 307);
}
