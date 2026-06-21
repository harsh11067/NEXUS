import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Allow the NEXUS_UI districts (served from a different origin/port, e.g. :4000
// or file://) to call the API. Single-operator console, so a permissive policy
// is fine here.
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const config = {
  matcher: "/api/:path*",
};
