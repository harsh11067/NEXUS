"use client";

import { useEffect, useState } from "react";
import { chosenNetwork, setChosenNetwork, type ClientNetwork } from "./client-net";

/**
 * Testnet / mainnet switch, sharing its choice with the cinematic districts
 * (one localStorage key). Reloads so every panel refetches on the new network.
 *
 * `mode` states plainly whether this deployment can sign on the active network:
 * "live" when an operator key is configured, "read-only" when it can only verify.
 */
export function NetworkSwitch({ active, canWrite }: { active?: string; canWrite?: boolean }) {
  const [choice, setChoice] = useState<ClientNetwork | null>(null);
  useEffect(() => setChoice(chosenNetwork()), []);
  const current = (active as ClientNetwork | undefined) ?? choice ?? undefined;

  function pick(n: ClientNetwork) {
    if (n === current) return;
    setChosenNetwork(n);
    window.location.reload();
  }

  return (
    <span className="netswitch">
      {(["galileo", "mainnet"] as ClientNetwork[]).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => pick(n)}
          className={n === current ? "on " + n : ""}
          title={n === "mainnet" ? "0G Mainnet (chain 16661)" : "0G Galileo Testnet (chain 16602)"}
        >
          {n === "mainnet" ? "MAINNET" : "TESTNET"}
        </button>
      ))}
      {canWrite !== undefined && (
        <span
          className={canWrite ? "mode live" : "mode ro"}
          title={
            canWrite
              ? "An operator key is configured for this network — server-signed actions work."
              : "Read-only here: verification works, signing needs an operator key or your own wallet."
          }
        >
          {canWrite ? "LIVE" : "READ-ONLY"}
        </span>
      )}
    </span>
  );
}
