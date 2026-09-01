/**
 * G2 — 0G Sealed Inference + attestation.
 * Make a real inference call and confirm we get (a) output and (b) a TEE
 * attestation/verification. This is the single biggest unknown per TEST_PLAN —
 * resolve it here before anything depends on it.
 *
 * Pass condition: non-empty output AND a verification result (true = TEE-verified;
 * null = provider exposes no TEE service — we surface that honestly).
 */
import { runInference, config } from "0g-nexus-sdk";
import { banner, ok, info, fail, preflight } from "./_common.js";

async function main() {
  banner("G2 · 0G Sealed Inference (TEE)");
  await preflight();
  info("mode", config.compute.mode());
  info("model", config.compute.model());
  if (config.compute.mode() === "router") {
    info("router", config.compute.routerUrl());
    if (!config.compute.apiKey()) {
      fail(
        "OG_COMPUTE_API_KEY is empty (mode=router). Add the sk-... key to .env, " +
          "or set OG_COMPUTE_MODE=broker to pay via the on-chain ledger.",
      );
    }
  }

  console.log("  calling Sealed Inference…");
  const res = await runInference([
    { role: "system", content: "You are a concise DeFi research analyst. Cite nothing you cannot verify." },
    { role: "user", content: "In one sentence, what is Total Value Locked (TVL)?" },
  ]);

  if (!res.content || res.content.trim().length === 0) fail("empty inference output");
  ok("got signed output");
  info("output", res.content.slice(0, 200).replace(/\n/g, " "));
  info("provider", res.provider || "(none reported)");
  info("chatID", res.chatID || "(none)");
  info("outputHash", res.outputHash);

  if (res.verified === true) {
    ok("TEE attestation VERIFIED — hardware-proven ✅");
  } else if (res.verified === null) {
    console.log(
      "  \x1b[33m! verification returned null — provider exposes no TEE verifiable service.\x1b[0m\n" +
        "    Output + hashes are still anchored; per ARCHITECTURE we verify off-chain.",
    );
  } else {
    fail("TEE verification returned FALSE — treat response as untrusted");
  }
  info("attestation", res.attestation.slice(0, 64) + "…");
}

main().catch((e) => fail(e?.stack ?? String(e)));
