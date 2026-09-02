"use client";

/**
 * The network the user picked, shared with the cinematic districts through one
 * localStorage key ("NEXUS_NETWORK"). Switch in a district and /console,
 * /leaderboard and /proof follow you; pick nothing and every page follows the
 * server's env default.
 */
export type ClientNetwork = "galileo" | "mainnet";
export const NETWORK_KEY = "NEXUS_NETWORK";

export const NETWORK_LABELS: Record<ClientNetwork, string> = {
  galileo: "0G Galileo Testnet",
  mainnet: "0G Mainnet",
};

export function chosenNetwork(): ClientNetwork | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(NETWORK_KEY);
    return v === "galileo" || v === "mainnet" ? v : null;
  } catch {
    return null;
  }
}

export function setChosenNetwork(n: ClientNetwork | null) {
  try {
    if (n) window.localStorage.setItem(NETWORK_KEY, n);
    else window.localStorage.removeItem(NETWORK_KEY);
  } catch {
    /* private mode — the session just follows the server default */
  }
}

/** Add the chosen network to an API path (no-op when nothing is chosen). */
export function api(path: string): string {
  const n = chosenNetwork();
  if (!n) return path;
  return path + (path.includes("?") ? "&" : "?") + "network=" + n;
}
