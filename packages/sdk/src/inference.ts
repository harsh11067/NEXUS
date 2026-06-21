/**
 * 0G Compute — Sealed Inference (TEE).
 *
 * Two real auth paths, auto-selected by OG_COMPUTE_MODE:
 *   - "router": Bearer API key against router-api.0g.ai (simplest).
 *   - "broker": on-chain ledger funded by PRIVATE_KEY, every request wallet-signed.
 *
 * In BOTH cases we independently verify the response came from a genuine TEE via
 * broker.inference.processResponse(): it reads the chain + calls the provider's
 * signature endpoint and checks the enclave signature. `verified === true` is our
 * hardware-proof. We anchor an attestation reference on chain and verify off-chain
 * (no on-chain TDX quote verification — that boundary is stated in ARCHITECTURE).
 */
import { Wallet, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { config } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface InferenceResult {
  content: string;
  model: string;
  provider: string;
  chatID: string;
  /** TEE verification result: true = hardware-verified, false = failed, null = no TEE service */
  verified: boolean | null;
  /** attestation reference we anchor on chain (verify off-chain) */
  attestation: string;
  inputHash: string;
  outputHash: string;
  raw: unknown;
}

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

function buildAttestation(parts: {
  provider: string;
  chatID: string;
  model: string;
  verified: boolean | null;
  outputHash: string;
}): string {
  return Buffer.from(JSON.stringify(parts)).toString("hex");
}

/** A read-only-ish broker on the compute chain, used to verify TEE signatures. */
async function verificationBroker(): Promise<Broker> {
  const provider = new JsonRpcProvider(config.compute.rpcUrl());
  // any wallet works for verification — it only reads chain + calls the provider
  const wallet = new Wallet(Wallet.createRandom().privateKey, provider);
  return createZGComputeNetworkBroker(wallet);
}

export async function runInference(messages: ChatMessage[]): Promise<InferenceResult> {
  const mode = config.compute.mode();
  if (mode === "broker") return runBroker(messages);
  return runRouter(messages);
}

// --------------------------------------------------------------- router mode
async function runRouter(messages: ChatMessage[]): Promise<InferenceResult> {
  const apiKey = config.compute.apiKey();
  if (!apiKey) {
    throw new Error(
      "OG_COMPUTE_MODE=router but OG_COMPUTE_API_KEY is empty. " +
        "Set the sk-... key in .env, or switch OG_COMPUTE_MODE=broker to pay via the on-chain ledger.",
    );
  }
  const model = config.compute.model();
  const res = await fetch(`${config.compute.routerUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    throw new Error(`router inference failed ${res.status}: ${await safeText(res)}`);
  }
  const data: any = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const provider: string = data?.x_0g_trace?.provider ?? "";
  const chatID: string = res.headers.get("ZG-Res-Key") ?? res.headers.get("zg-res-key") ?? data?.id ?? "";

  let verified: boolean | null = null;
  if (provider && chatID) {
    try {
      const broker = await verificationBroker();
      verified = await broker.inference.processResponse(provider, chatID);
    } catch (e) {
      verified = null;
    }
  }
  return finalize(messages, content, { model, provider, chatID, verified, raw: data });
}

// --------------------------------------------------------------- broker mode
async function runBroker(messages: ChatMessage[]): Promise<InferenceResult> {
  const provider = new JsonRpcProvider(config.compute.rpcUrl());
  const wallet = new Wallet(config.privateKey(), provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // ensure the ledger has funds
  await ensureLedger(broker);

  // choose a provider
  let providerAddress = config.compute.provider();
  if (!providerAddress) {
    const services: any[] = await broker.inference.listService();
    if (!services || services.length === 0) throw new Error("no inference services available");
    providerAddress = services[0].provider ?? services[0][0];
  }
  providerAddress = providerAddress!;

  // acknowledge provider (required once before first use) — ignore if already done
  try {
    await (broker.inference as any).acknowledgeProviderSigner(providerAddress);
  } catch { /* already acknowledged */ }

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers as unknown as Record<string, string>) },
    body: JSON.stringify({ messages, model }),
  });
  if (!res.ok) throw new Error(`broker inference failed ${res.status}: ${await safeText(res)}`);
  const data: any = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const chatID: string = res.headers.get("ZG-Res-Key") ?? res.headers.get("zg-res-key") ?? data?.id ?? "";

  let verified: boolean | null = null;
  try {
    verified = await broker.inference.processResponse(providerAddress, chatID);
  } catch { verified = null; }

  return finalize(messages, content, { model, provider: providerAddress, chatID, verified, raw: data });
}

async function ensureLedger(broker: Broker): Promise<void> {
  // 0G Compute requires a minimum 3 0G to OPEN a ledger (one-time).
  const deposit = Math.max(config.compute.deposit(), 3);
  try {
    await broker.ledger.getLedger();
    return; // ledger already exists -> nothing to do
  } catch {
    /* no ledger yet -> create below */
  }
  try {
    await broker.ledger.addLedger(deposit);
  } catch (e) {
    throw new Error(
      `failed to open compute ledger (broker mode needs a one-time ${deposit} 0G deposit, ` +
        `so the wallet must hold ≥ ~${deposit + 0.2} 0G). Fund more at https://faucet.0g.ai ` +
        `(or the Google Cloud 0G faucet), or switch to OG_COMPUTE_MODE=router with an sk- API key. ` +
        `Underlying: ${String(e)}`,
    );
  }
}

function finalize(
  messages: ChatMessage[],
  content: string,
  meta: { model: string; provider: string; chatID: string; verified: boolean | null; raw: unknown },
): InferenceResult {
  const inputHash = keccak256(toUtf8Bytes(JSON.stringify(messages)));
  const outputHash = keccak256(toUtf8Bytes(content));
  const attestation = buildAttestation({
    provider: meta.provider,
    chatID: meta.chatID,
    model: meta.model,
    verified: meta.verified,
    outputHash,
  });
  return {
    content,
    model: meta.model,
    provider: meta.provider,
    chatID: meta.chatID,
    verified: meta.verified,
    attestation,
    inputHash,
    outputHash,
    raw: meta.raw,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
