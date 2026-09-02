import "server-only";
import { parseNetwork, withNetwork, type NetworkName } from "0g-nexus-sdk";

/**
 * One deployment, both 0G networks.
 *
 * The process default comes from env (OG_NETWORK / NEXT_PUBLIC_USE_MAINNET).
 * A client that wants the other network says so per request — `?network=galileo`
 * or an `x-nexus-network` header — and the whole handler runs with that network
 * active (SDK-side AsyncLocalStorage, so concurrent requests never bleed into
 * each other the way a `process.env` mutation would).
 *
 * This only selects a *network*, never a key: mainnet writes still require
 * OG_MAINNET_KEY and testnet writes still require PRIVATE_KEY, so a browser can
 * never talk a read-only deployment into signing something.
 */
export function networkFromRequest(req: Request): NetworkName | undefined {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URL(req.url).searchParams.get("network");
  } catch {
    /* non-absolute URL — header only */
  }
  return parseNetwork(fromQuery) ?? parseNetwork(req.headers.get("x-nexus-network"));
}

/** Wrap a route handler so it runs on the network the caller asked for. */
export function withNet<H extends (req: Request, ctx: any) => Promise<Response>>(handler: H): H {
  return ((req: Request, ctx: any) =>
    withNetwork(networkFromRequest(req), () => handler(req, ctx))) as H;
}
