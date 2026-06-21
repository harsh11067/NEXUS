/* NEXUS shared API client — the one bridge between the cinematic districts and
   the real on-chain backend (the Next.js API that wraps @nexus/sdk).

   Every district loads this in <helmet> (like nexus-district.js) and talks to
   the chain through window.NexusAPI. It NEVER changes the visual experience —
   it only feeds live data into the views that were previously hardcoded.

   API base resolution order:
     1. window.NEXUS_API_BASE         (set inline before this script)
     2. localStorage 'NEXUS_API_BASE'
     3. same host on :3000            (default Next dev server)
*/
(function () {
  function resolveBase() {
    if (typeof window !== "undefined" && window.NEXUS_API_BASE) return window.NEXUS_API_BASE;
    try {
      const ls = localStorage.getItem("NEXUS_API_BASE");
      if (ls) return ls;
    } catch (e) {}
    // Unified server: districts are served from the same origin as /api -> use it.
    if (location.protocol === "http:" || location.protocol === "https:") return location.origin;
    // Opened via file:// -> fall back to the default Next dev port.
    return `http://${location.hostname || "localhost"}:3000`;
  }

  const BASE = resolveBase();
  const EXPLORER = "https://chainscan-galileo.0g.ai";
  const STORAGE_EXPLORER = "https://storagescan-galileo.0g.ai";

  const TIER_COLORS = {
    Unverified: "#9aa6c2",
    Emerging: "#e7eeff",
    Trusted: "#4aa3ff",
    Verified: "#ffcf5a",
    Elite: "#b06bff",
    Flagged: "#ff5a6a",
    Banned: "#ff8a8a",
  };

  async function http(path, opts) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts && opts.headers) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || (data && data.error)) {
      const msg = (data && data.error) || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return data;
  }

  const NexusAPI = {
    base: BASE,
    explorer: EXPLORER,

    // ---- reads ----
    config() { return http("/api/config"); },
    status() { return http("/api/status"); },
    receiptProof(id) { return http(`/api/receipts/${id}`); },
    listAgents() { return http("/api/agents").then((r) => (r && r.agents) || []); },
    getCard(id) { return http(`/api/agents/${id}`); },

    // ---- writes (signed server-side with the operator key) ----
    createAgent(persona) {
      return http("/api/agents", { method: "POST", body: JSON.stringify(persona) });
    },
    runTask(id, prompt, prove) {
      return http(`/api/agents/${id}/run`, {
        method: "POST",
        body: JSON.stringify({ prompt, prove: prove !== false }),
      });
    },
    cloneAgent(id, body) {
      return http(`/api/agents/${id}/clone`, { method: "POST", body: JSON.stringify(body || {}) });
    },
    transferAgent(id, body) {
      return http(`/api/agents/${id}/transfer`, { method: "POST", body: JSON.stringify(body || {}) });
    },
    listReceipts() { return http("/api/receipts").then((r) => (r && r.receipts) || []); },
    network() { return http("/api/network"); },

    // ---- helpers ----
    tierColor(tier) { return TIER_COLORS[tier] || "#9aa6c2"; },
    txUrl(hash) { return `${EXPLORER}/tx/${hash}`; },
    addrUrl(addr) { return `${EXPLORER}/address/${addr}`; },
    fileUrl(root) { return `${STORAGE_EXPLORER}/file/${root}`; },
    short(s, head = 6, tail = 4) {
      if (!s) return "";
      return s.length > head + tail + 2 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
    },

    // resolve when the client is ready (it always is, but mirrors NexusDistrict)
    ready() { return Promise.resolve(NexusAPI); },

    // a default persona scaffold districts can clone + tweak
    samplePersona(name, systemPrompt) {
      return {
        name: name || "New Agent",
        description: name || "New Agent",
        systemPrompt: systemPrompt || "You are a helpful, verifiable AI agent.",
        memory: [],
        policy: {
          maxPerTx: "500000000000000",
          dailyBudget: "5000000000000000",
          maxTaskTTL: 300,
          allowedTools: [],
          bannedActions: ["sendTransaction", "transferFunds"],
        },
      };
    },
  };

  // ==========================================================================
  // WALLET LAYER (MetaMask via viem, no bundler) — the user owns their agents.
  // Districts aren't React, so we use viem directly (wagmi is React-only).
  // ==========================================================================
  const VIEM = "https://esm.sh/viem@2.21.55";
  let _v = null, _acc = null, _cfg = null, _chain = null;
  const state = { address: null, pubKey: null, connected: false, chainOk: false };

  async function viem() {
    if (!_v) { _v = await import(VIEM); _acc = await import(VIEM + "/accounts"); }
    return _v;
  }
  async function cfg() { if (!_cfg) _cfg = await NexusAPI.config(); return _cfg; }
  async function chain() {
    if (_chain) return _chain;
    const v = await viem(); const c = await cfg();
    _chain = v.defineChain({
      id: c.chainId, name: c.chainName, nativeCurrency: c.currency,
      rpcUrls: { default: { http: [c.rpcUrl] } },
      blockExplorers: { default: { name: "chainscan", url: c.explorerUrl } },
    });
    return _chain;
  }

  async function ensureChain() {
    const c = await cfg();
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.chainHex }] });
    } catch (e) {
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: c.chainHex, chainName: c.chainName, nativeCurrency: c.currency, rpcUrls: [c.rpcUrl], blockExplorerUrls: [c.explorerUrl] }],
        });
      } else throw e;
    }
    state.chainOk = true;
  }

  async function connect() {
    if (!window.ethereum) throw new Error("MetaMask not found — install it to create and own agents.");
    const accts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.address = accts[0];
    await ensureChain();
    state.connected = true;
    attachListeners();
    return state.address;
  }

  let _listening = false;
  function attachListeners() {
    if (_listening || !window.ethereum || !window.ethereum.on) return;
    _listening = true;
    window.ethereum.on("accountsChanged", (a) => { state.address = a && a[0] ? a[0] : null; state.pubKey = null; state.connected = !!(a && a[0]); });
    window.ethereum.on("chainChanged", () => { state.chainOk = false; });
  }

  // Silently restore an existing authorization (no popup) so the connection
  // persists across districts — connect once, never asked again.
  async function restoreConnection() {
    if (!window.ethereum) return;
    try {
      const a = await window.ethereum.request({ method: "eth_accounts" });
      if (a && a[0]) { state.address = a[0]; state.connected = true; attachListeners(); }
    } catch (e) { /* ignore */ }
  }

  // personal_sign proves key ownership AND lets us recover the secp256k1 pubkey
  // we ECIES-encrypt the persona to (MetaMask can't do ECIES decrypt; the oracle does).
  async function getPubKey() {
    if (state.pubKey) return state.pubKey;
    const v = await viem();
    const msg = "NEXUS — prove wallet ownership and derive your agent encryption key.\n" + state.address;
    const sig = await window.ethereum.request({ method: "personal_sign", params: [msg, state.address] });
    state.pubKey = await v.recoverPublicKey({ hash: v.hashMessage(msg), signature: sig });
    return state.pubKey;
  }

  const AGENT_ABI = [
    "function mint(bytes encryptedPersonaCID, bytes32 policyHash, address owner_, bytes ownerPubKey) returns (uint256)",
    "function clone(uint256 agentId, address to, bytes sealedKey, bytes signature) payable returns (uint256)",
    "function requestTransfer(uint256 agentId, address buyer, bytes buyerPubKey)",
    "function authorizeUsage(uint256 agentId, address executor, bytes permissions)",
    "event AgentMinted(uint256 indexed agentId, address indexed owner, bytes encryptedPersonaCID)",
    "event AgentCloned(uint256 indexed parentId, uint256 indexed newAgentId, address indexed cloner)",
  ];

  async function write(fn, args, value) {
    const v = await viem(); const ch = await chain(); const c = await cfg();
    const abi = v.parseAbi(AGENT_ABI);
    const wc = v.createWalletClient({ account: state.address, chain: ch, transport: v.custom(window.ethereum) });
    const pc = v.createPublicClient({ chain: ch, transport: v.custom(window.ethereum) });
    const hash = await wc.writeContract({ address: c.addresses.NexusAgent, abi, functionName: fn, args, value, account: state.address, chain: ch });
    const rcpt = await pc.waitForTransactionReceipt({ hash });
    return { hash, rcpt, v, abi };
  }

  async function authorize(agentId) {
    const c = await cfg();
    if (!c.executor) return;
    try { await write("authorizeUsage", [BigInt(agentId), c.executor, "0x"], undefined); } catch (e) { /* non-fatal */ }
  }

  async function mintWithWallet(persona) {
    await connectIfNeeded();
    const pub = await getPubKey();
    const prep = await http("/api/prepare-mint", { method: "POST", body: JSON.stringify({ persona, ownerAddress: state.address, ownerPubKey: pub }) });
    const { hash, rcpt, v, abi } = await write("mint", [prep.cipherRef, prep.policyHash, state.address, prep.ownerPubKeyBytes]);
    const logs = v.parseEventLogs({ abi, logs: rcpt.logs, eventName: "AgentMinted" });
    const agentId = logs.length ? logs[0].args.agentId.toString() : null;
    if (agentId) await authorize(agentId);
    return { agentId, owner: state.address, mintTx: hash, mintTxUrl: NexusAPI.txUrl(hash), personaRootHash: prep.personaRootHash };
  }

  async function cloneWithWallet(agentId) {
    await connectIfNeeded();
    const pub = await getPubKey();
    const prep = await http(`/api/agents/${agentId}/prepare-clone`, { method: "POST", body: JSON.stringify({ toAddress: state.address, toPubKey: pub }) });
    const { hash, rcpt, v, abi } = await write("clone", [BigInt(agentId), state.address, prep.sealedRef, prep.signature], BigInt(prep.royaltyWei));
    const logs = v.parseEventLogs({ abi, logs: rcpt.logs, eventName: "AgentCloned" });
    const newAgentId = logs.length ? logs[0].args.newAgentId.toString() : null;
    if (newAgentId) await authorize(newAgentId);
    return { parentId: String(agentId), newAgentId, cloner: state.address, cloneTx: hash, cloneTxUrl: NexusAPI.txUrl(hash) };
  }

  async function transferWithWallet(agentId) {
    await connectIfNeeded();
    await viem();
    // generate a fresh buyer keypair client-side (the "new owner")
    const priv = _acc.generatePrivateKey();
    const buyer = _acc.privateKeyToAccount(priv);
    const buyerPubKey = buyer.publicKey;
    // step 1: USER signs requestTransfer (only the owner can)
    await write("requestTransfer", [BigInt(agentId), buyer.address, buyerPubKey]);
    // step 2: oracle re-encrypts for the buyer + finalizes
    const r = await http(`/api/agents/${agentId}/finalize-transfer`, { method: "POST", body: JSON.stringify({ buyerPubKey }) });
    return { to: buyer.address, oldRootHash: r.oldRootHash, newRootHash: r.newRootHash, finalizeTx: r.finalizeTx, finalizeTxUrl: r.finalizeTxUrl };
  }

  async function connectIfNeeded() { if (!state.connected) await connect(); else await ensureChain(); }

  // ---- header CTA wiring only (NO wallet UI — wallet is an implementation detail) ----
  // The single existing primary CTA per district keeps its design/placement/size;
  // we only set its label and hide the wallet flow behind clicking it.
  const DISTRICTS = [
    { match: "world",       label: "Enter Nexus",       go: "Marketplace.dc.html" },
    { match: "marketplace", label: "Open Marketplace",  go: null },
    { match: "audit",       label: "Open ProofMesh",    go: null },
    { match: "execution",   label: "Open ReceiptGuard", go: null },
    { match: "network",     label: "Open Network",      go: null },
    { match: "treasury",    label: "Open Treasury",     go: null },
    { match: "soulmint",    label: "Open SoulMint",     go: null },
  ];
  function currentDistrict() {
    const p = decodeURIComponent(location.pathname).toLowerCase();
    for (const d of DISTRICTS) { if (d.match !== "world" && p.includes(d.match)) return d; }
    return DISTRICTS[0]; // World (file name contains "world", and is the default)
  }
  function findPrimaryCTA() {
    const nav = document.querySelector("nav");
    if (!nav) return null;
    const btns = [...nav.querySelectorAll("button")];
    // primary CTA = the filled gradient button (not the outlined "Sign In")
    return btns.reverse().find((b) => /linear-gradient/.test(b.getAttribute("style") || "")) || null;
  }
  function wireHeaderCTA(tries) {
    tries = tries || 0;
    const cta = findPrimaryCTA();
    if (!cta) { if (tries < 25) setTimeout(() => wireHeaderCTA(tries + 1), 200); return; }
    const d = currentDistrict();
    cta.textContent = d.label;
    cta.onclick = async (e) => {
      e.preventDefault();
      // connect silently if a wallet is available; never block entering the flow
      // (the wallet is only required at write-time: mint / clone / transfer).
      try { await connectIfNeeded(); } catch (err) { /* wallet optional for browsing */ }
      if (d.go) location.href = d.go;
    };
  }

  NexusAPI.wallet = {
    connect, getPubKey, ensureChain,
    get address() { return state.address; },
    get connected() { return state.connected; },
  };
  NexusAPI.mintWithWallet = mintWithWallet;
  NexusAPI.cloneWithWallet = cloneWithWallet;
  NexusAPI.transferWithWallet = transferWithWallet;

  window.NexusAPI = NexusAPI;
  function boot() { restoreConnection(); wireHeaderCTA(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
