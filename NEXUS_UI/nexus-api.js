/* NEXUS shared API client — the one bridge between the cinematic districts and
   the real on-chain backend (the Next.js API that wraps 0g-nexus-sdk).

   Every district loads this in <helmet> (like nexus-district.js) and talks to
   the chain through window.NexusAPI. It NEVER changes the visual experience —
   it only feeds live data into the views that were previously hardcoded, wires
   the buttons the static export left inert, and offers the network switch.

   API base resolution order:
     1. window.NEXUS_API_BASE         (set inline before this script)
     2. localStorage 'NEXUS_API_BASE'
     3. same origin                   (unified server)
     4. :3000                         (opened over file://)

   Network selection:
     the server decides by env; a stored choice ('NEXUS_NETWORK') overrides it
     per request via ?network=, so one deployment serves both 0G networks and
     the switch in the nav is the whole mechanism.
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

  // ---------------------------------------------------------------- networks
  // Mirrors NETWORKS in the SDK. Kept client-side so explorer links are right
  // from the first paint; /api/config is still the authority and overwrites it.
  const PRESETS = {
    galileo: {
      name: "galileo", label: "0G Galileo Testnet", short: "TESTNET", chainId: 16602,
      explorerUrl: "https://chainscan-galileo.0g.ai",
      storageExplorer: "https://storagescan-galileo.0g.ai",
    },
    mainnet: {
      name: "mainnet", label: "0G Mainnet", short: "MAINNET", chainId: 16661,
      explorerUrl: "https://chainscan.0g.ai",
      storageExplorer: "https://storagescan.0g.ai",
    },
  };
  const NET_KEY = "NEXUS_NETWORK";

  function storedNetwork() {
    try {
      const v = localStorage.getItem(NET_KEY);
      return PRESETS[v] ? v : null;
    } catch (e) { return null; }
  }
  function storeNetwork(n) {
    try { PRESETS[n] ? localStorage.setItem(NET_KEY, n) : localStorage.removeItem(NET_KEY); } catch (e) {}
  }

  // the caller's explicit choice (null = follow whatever the server defaults to)
  let CHOICE = storedNetwork();
  // the resolved active network — provisional until /api/config answers
  let ACTIVE = CHOICE || "mainnet";
  let CFG = null;

  function preset() { return PRESETS[ACTIVE] || PRESETS.mainnet; }
  function netQuery(path) {
    if (!CHOICE) return path;
    return path + (path.indexOf("?") === -1 ? "?" : "&") + "network=" + CHOICE;
  }

  // A read-only deployment has no operator key for the active network. Say that
  // in words a user can act on instead of leaking the server's env-var name.
  function humanizeError(msg) {
    const s = String(msg || "");
    if (/operator key not configured|read-only|OG_MAINNET_KEY|Missing required env var PRIVATE_KEY/i.test(s)) {
      const other = ACTIVE === "mainnet" ? "galileo" : "mainnet";
      const canOther = CFG && (CFG.networks || []).some((n) => n.network === other && n.canWrite);
      return (
        preset().label + " is read-only on this deployment — it can verify everything, " +
        "but it holds no operator key to sign with." +
        (canOther ? " Switch to " + PRESETS[other].label + " (top right) to run live actions." :
                    " Connect a wallet to sign mint / clone / transfer yourself.")
      );
    }
    if (/gas tip cap|gas price below minimum/i.test(s)) {
      return "The wallet offered too low a gas tip for 0G — retry, the fee floor is applied automatically now.";
    }
    if (/user rejected|User denied/i.test(s)) return "Wallet request rejected.";
    return s;
  }

  // /api/config is fetched once at boot; every other call waits for it so the
  // active network (and therefore every explorer link) is known before use.
  let _boot = null;
  function boot() {
    if (!_boot) {
      _boot = fetch(BASE + netQuery("/api/config"))
        .then((r) => r.json())
        .then((c) => {
          if (c && !c.error) {
            CFG = c;
            ACTIVE = c.network || ACTIVE;
            const p = PRESETS[ACTIVE];
            if (c.explorerUrl) p.explorerUrl = c.explorerUrl;
            if (c.storageExplorer) p.storageExplorer = c.storageExplorer;
            if (c.chainName) p.label = c.chainName;
          }
          return CFG;
        })
        .catch(() => null);
    }
    return _boot;
  }

  async function http(path, opts) {
    await boot();
    const res = await fetch(BASE + netQuery(path), {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts && opts.headers) },
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || (data && data.error)) {
      throw new Error(humanizeError((data && data.error) || `${res.status} ${res.statusText}`));
    }
    return data;
  }

  const TIER_COLORS = {
    Unverified: "#9aa6c2",
    Emerging: "#e7eeff",
    Trusted: "#4aa3ff",
    Verified: "#ffcf5a",
    Elite: "#b06bff",
    Flagged: "#ff5a6a",
    Banned: "#ff8a8a",
  };

  const NexusAPI = {
    base: BASE,
    get explorer() { return preset().explorerUrl; },
    get networkLabel() { return preset().label; },
    get networkName() { return ACTIVE; },
    get config() { return CFG; },
    ready() { return boot().then(() => NexusAPI); },

    // ---- reads ----
    configuration() { return http("/api/config"); },
    status() { return http("/api/status"); },
    receiptProof(id) { return http(`/api/receipts/${id}`); },
    listAgents() { return http("/api/agents").then((r) => (r && r.agents) || []); },
    getCard(id) { return http(`/api/agents/${id}`); },
    listReceipts() { return http("/api/receipts").then((r) => (r && r.receipts) || []); },
    // districts call this one; kept under its original name
    network() { return http("/api/network"); },

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

    // ---- helpers ----
    tierColor(tier) { return TIER_COLORS[tier] || "#9aa6c2"; },
    txUrl(hash) { return `${preset().explorerUrl}/tx/${hash}`; },
    addrUrl(addr) { return `${preset().explorerUrl}/address/${addr}`; },
    fileUrl(root) { return `${preset().storageExplorer}/file/${root}`; },
    appUrl(path) { return BASE + path; },
    address(name) { return (CFG && CFG.addresses && CFG.addresses[name]) || null; },
    short(s, head = 6, tail = 4) {
      if (!s) return "";
      return s.length > head + tail + 2 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
    },
    setNetwork(n) {
      if (!PRESETS[n] || n === ACTIVE) return;
      storeNetwork(n);
      location.reload();
    },

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
  let _v = null, _acc = null, _chain = null;
  const state = { address: null, pubKey: null, connected: false, chainOk: false };

  async function viem() {
    if (!_v) { _v = await import(VIEM); _acc = await import(VIEM + "/accounts"); }
    return _v;
  }
  async function cfg() { await boot(); if (!CFG) throw new Error("API unreachable"); return CFG; }
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
    renderIdentity();
    return state.address;
  }

  let _listening = false;
  function attachListeners() {
    if (_listening || !window.ethereum || !window.ethereum.on) return;
    _listening = true;
    window.ethereum.on("accountsChanged", (a) => {
      state.address = a && a[0] ? a[0] : null; state.pubKey = null; state.connected = !!(a && a[0]);
      renderIdentity();
    });
    window.ethereum.on("chainChanged", () => { state.chainOk = false; });
  }

  // Silently restore an existing authorization (no popup) so the connection
  // persists across districts — connect once, never asked again.
  async function restoreConnection() {
    if (!window.ethereum) return;
    try {
      const a = await window.ethereum.request({ method: "eth_accounts" });
      if (a && a[0]) { state.address = a[0]; state.connected = true; attachListeners(); renderIdentity(); }
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

  // 0G rejects transactions whose priority fee is under 2 gwei
  // ("gas tip cap 1000000000, minimum needed 2000000000") and viem's default
  // estimate lands below that. Take the higher of the node's estimate and the
  // floor, and keep maxFee above the tip.
  const MIN_TIP = 2000000000n;
  async function feeOverrides(pc) {
    let est = null;
    try { est = await pc.estimateFeesPerGas(); } catch (e) { /* fall back to the floor */ }
    let tip = (est && est.maxPriorityFeePerGas) || MIN_TIP;
    if (tip < MIN_TIP) tip = MIN_TIP;
    let max = (est && est.maxFeePerGas) || tip * 2n;
    if (max < tip * 2n) max = tip * 2n;
    return { maxPriorityFeePerGas: tip, maxFeePerGas: max };
  }

  async function write(fn, args, value) {
    const v = await viem(); const ch = await chain(); const c = await cfg();
    const abi = v.parseAbi(AGENT_ABI);
    const wc = v.createWalletClient({ account: state.address, chain: ch, transport: v.custom(window.ethereum) });
    const pc = v.createPublicClient({ chain: ch, transport: v.custom(window.ethereum) });
    const f = await feeOverrides(pc);
    const hash = await wc.writeContract({
      address: c.addresses.NexusAgent, abi, functionName: fn, args, value,
      account: state.address, chain: ch,
      maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas,
    });
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

  // ==========================================================================
  // CHROME — the pieces the static export left inert: the network switch, the
  // header CTA, sign-in, and the "view on explorer" buttons. Design untouched:
  // we only give existing elements a destination.
  // ==========================================================================
  const DISTRICTS = [
    { match: "world",       label: "Enter Nexus",      go: "Marketplace.dc.html" },
    { match: "marketplace", label: "Browse Agents",    go: "/leaderboard" },
    { match: "audit",       label: "Open ProofMesh",   go: "/proof" },
    { match: "execution",   label: "Open Console",     go: "/console" },
    { match: "network",     label: "Command Center",   go: "/console" },
    { match: "treasury",    label: "Open Leaderboard", go: "/leaderboard" },
    { match: "soulmint",    label: "Forge Identity",   go: null, click: "#sm-next" },
  ];
  const DOCS_URL = "https://github.com/harsh11067/NEXUS#readme";

  function currentDistrict() {
    const p = decodeURIComponent(location.pathname).toLowerCase();
    for (const d of DISTRICTS) { if (d.match !== "world" && p.indexOf(d.match) !== -1) return d; }
    return DISTRICTS[0]; // World (file name contains "world", and is the default)
  }
  function navTo(go) {
    if (!go) return;
    location.href = go.charAt(0) === "/" ? BASE + go : go;
  }
  function buttons() { return [].slice.call(document.querySelectorAll("button")); }
  function byLabel(re, all) {
    const list = buttons().filter((b) => re.test((b.textContent || "").replace(/\s+/g, " ").trim()));
    return all ? list : list[0] || null;
  }
  function isGradient(b) { return /linear-gradient/.test(b.getAttribute("style") || ""); }
  function findPrimaryCTA() {
    const nav = document.querySelector("nav");
    if (!nav) return null;
    // primary CTA = the filled gradient button (not the outlined "Sign In")
    return [].slice.call(nav.querySelectorAll("button")).reverse().find(isGradient) || null;
  }

  // ---- network switch -------------------------------------------------------
  function buildNetworkSwitch() {
    const nav = document.querySelector("nav");
    if (!nav || document.getElementById("nx-net")) return;
    const group = nav.lastElementChild;
    if (!group) return;
    const wrap = document.createElement("div");
    wrap.id = "nx-net";
    wrap.style.cssText =
      "display:flex;align-items:center;gap:2px;padding:3px;border-radius:9px;pointer-events:auto;" +
      "background:rgba(9,15,28,0.62);border:1px solid rgba(120,150,210,0.26);backdrop-filter:blur(10px)";
    wrap.title = "Switch the whole app between 0G networks";
    ["galileo", "mainnet"].forEach((n) => {
      const b = document.createElement("button");
      b.setAttribute("data-net", n);
      b.textContent = PRESETS[n].short;
      b.style.cssText =
        "border:none;background:transparent;color:#8694b4;font-family:'JetBrains Mono',monospace;" +
        "font-size:10px;letter-spacing:.1em;padding:6px 10px;border-radius:7px;cursor:pointer;transition:all .18s";
      b.onclick = () => NexusAPI.setNetwork(n);
      wrap.appendChild(b);
    });
    const mode = document.createElement("span");
    mode.id = "nx-net-mode";
    mode.style.cssText =
      "font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;color:#6a7da0;padding:0 8px 0 4px";
    wrap.appendChild(mode);
    group.insertBefore(wrap, group.firstChild);
    paintNetworkSwitch();
  }
  function paintNetworkSwitch() {
    const wrap = document.getElementById("nx-net");
    if (!wrap) return;
    [].slice.call(wrap.querySelectorAll("button[data-net]")).forEach((b) => {
      const n = b.getAttribute("data-net");
      const on = n === ACTIVE;
      const live = n === "mainnet";
      b.style.background = on ? (live ? "rgba(74,222,128,0.14)" : "rgba(245,183,64,0.14)") : "transparent";
      b.style.color = on ? (live ? "#7fe6a3" : "#f0cd8a") : "#8694b4";
      b.style.boxShadow = on ? "inset 0 0 0 1px " + (live ? "rgba(74,222,128,0.4)" : "rgba(245,183,64,0.4)") : "none";
    });
    const mode = document.getElementById("nx-net-mode");
    if (mode) {
      const w = CFG ? CFG.canWrite : null;
      mode.textContent = w === null ? "" : w ? "LIVE" : "READ-ONLY";
      mode.style.color = w ? "#7fe6a3" : "#c58b8b";
      mode.title = w
        ? "An operator key is configured for " + preset().label + " — server-signed actions work."
        : preset().label + " is read-only here: verification works, signing needs your wallet or an operator key.";
    }
  }

  // ---- sign in --------------------------------------------------------------
  function renderIdentity() {
    const b = byLabel(/^(Sign In|Connecting…|0x[0-9a-fA-F])/);
    if (!b) return;
    if (state.address) {
      b.textContent = NexusAPI.short(state.address, 6, 4);
      b.style.borderColor = "rgba(74,222,128,0.4)";
      b.style.color = "#7fe6a3";
      b.title = state.address + " — click to view on " + preset().label;
    } else {
      b.textContent = "Sign In";
      b.style.borderColor = "rgba(120,150,210,0.32)";
      b.style.color = "#dde6ff";
      b.title = "Connect a wallet — you sign mint / clone / transfer yourself";
    }
  }
  async function signIn() {
    if (state.address) { window.open(NexusAPI.addrUrl(state.address), "_blank"); return; }
    const b = byLabel(/^Sign In$/);
    try {
      if (b) b.textContent = "Connecting…";
      await connect();
    } catch (e) {
      renderIdentity();
      alert(humanizeError(e && e.message));
    }
  }

  // ---- explorer buttons -----------------------------------------------------
  // Each district has one "view this on the explorer" button whose target was
  // never set. Point it at the contract that district actually stands for, on
  // the ACTIVE network's explorer.
  const EXPLORER_TARGETS = {
    audit: ["NexusTEEValidator", "CompositeReceiptMinter"],   // Verification Tower
    execution: ["NexusEscrow", "CompositeReceiptMinter"],     // Execution Exchange
    network: ["NexusAgent"],                                  // the agent registry
    treasury: ["NexusEscrow"],                                // capital held in escrow
    marketplace: ["NexusAgent"],
    soulmint: ["NexusAgent"],
    world: ["NexusAgent"],
  };
  function wireExplorerButtons() {
    const d = currentDistrict();
    const names = EXPLORER_TARGETS[d.match] || ["NexusAgent"];
    const target = names.map((n) => NexusAPI.address(n)).filter(Boolean)[0];
    byLabel(/(View|Open).*(Explorer|chainscan)/i, true).forEach((b) => {
      if (!target) {
        b.disabled = true;
        b.style.opacity = "0.5";
        b.title = "No deployment known for " + preset().label;
        return;
      }
      b.title = target + " on " + preset().label;
      b.onclick = () => window.open(NexusAPI.addrUrl(target), "_blank");
    });
    // Treasury's "Rebalance Strategy" has no on-chain meaning; make it do the
    // honest thing (show the escrow that actually holds value) rather than
    // pretend to move funds.
    const reb = byLabel(/^Rebalance Strategy/);
    if (reb) {
      const esc = NexusAPI.address("NexusEscrow");
      if (esc) {
        reb.textContent = "View Escrow on chainscan →";
        reb.title = esc + " on " + preset().label;
        reb.onclick = () => window.open(NexusAPI.addrUrl(esc), "_blank");
      }
    }
  }

  // Actions that need a server-side signature (persona encryption + 0G Storage
  // upload, receipt minting, the oracle's re-encryption). On a read-only
  // network they still explain themselves on click; the tooltip says so up front.
  function markWriteButtons() {
    if (!CFG || CFG.canWrite) return;
    byLabel(/^(Hire Agent|Clone|Transfer|Advance Forge|Retry Mint)/, true).forEach((b) => {
      b.title =
        preset().label + " is read-only on this deployment — no operator key to sign with. " +
        "Use the network switch in the header to run live actions.";
    });
  }

  // ---- landing page CTAs ----------------------------------------------------
  function wireLanding() {
    const map = [
      [/^Explore the Network/, () => navTo("Network.dc.html")],
      [/^Launch the Network/, () => navTo("Marketplace.dc.html")],
      [/Learn the System$/, () => window.open(DOCS_URL, "_blank")],
      [/^Sign In$|^0x[0-9a-fA-F]/, signIn],
    ];
    map.forEach((pair) => byLabel(pair[0], true).forEach((b) => { b.onclick = pair[1]; }));
    // the "Docs" item in the nav is a bare <span>
    [].slice.call(document.querySelectorAll("nav span"))
      .filter((s) => (s.textContent || "").trim() === "Docs")
      .forEach((s) => { s.style.cursor = "pointer"; s.onclick = () => window.open(DOCS_URL, "_blank"); });
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
      if (d.click) { const el = document.querySelector(d.click); if (el) { el.click(); return; } }
      navTo(d.go);
    };
  }

  NexusAPI.wallet = {
    connect, getPubKey, ensureChain, signIn,
    get address() { return state.address; },
    get connected() { return state.connected; },
  };
  NexusAPI.mintWithWallet = mintWithWallet;
  NexusAPI.cloneWithWallet = cloneWithWallet;
  NexusAPI.transferWithWallet = transferWithWallet;
  NexusAPI.humanizeError = humanizeError;

  window.NexusAPI = NexusAPI;

  function start() {
    restoreConnection();
    wireHeaderCTA();
    wireLanding();
    buildNetworkSwitch();
    renderIdentity();
    boot().then(() => {
      paintNetworkSwitch();
      renderIdentity();
      wireExplorerButtons();
      wireLanding();
      markWriteButtons();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
