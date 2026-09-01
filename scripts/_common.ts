import { getProvider, getWallet, config, deploymentsExist, explorerAddress } from "0g-nexus-sdk";
import { formatEther } from "ethers";

export function banner(title: string) {
  const line = "─".repeat(Math.max(8, title.length + 4));
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title}  │`);
  console.log(`└${line}┘`);
}

export function ok(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
export function info(label: string, value: string) {
  console.log(`    ${label.padEnd(16)} ${value}`);
}
export function fail(msg: string): never {
  console.error(`  \x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

export async function preflight(opts: { needDeployments?: boolean } = {}) {
  let pk: string;
  try {
    pk = config.privateKey();
  } catch {
    fail("PRIVATE_KEY is not set. Copy .env.example -> .env and fill in a funded 0G testnet key.");
  }
  const provider = getProvider();
  const net = await provider.getNetwork();
  const wallet = getWallet();
  const bal = await provider.getBalance(wallet.address);
  info("network", `chainId ${net.chainId} (${config.rpcUrl()})`);
  info("wallet", wallet.address);
  info("balance", `${formatEther(bal)} 0G`);
  if (bal === 0n) {
    fail(
      config.network() === "mainnet"
        ? "Mainnet wallet has 0 balance. Fund OG_MAINNET_KEY with real 0G first."
        : "Wallet has 0 balance. Fund it at https://faucet.0g.ai before running gate-checks.",
    );
  }
  if (opts.needDeployments && !deploymentsExist()) {
    fail(`No ${config.network()} deployments. Deploy first: \`pnpm deploy:${config.network() === "mainnet" ? "mainnet" : "testnet"}\`.`);
  }
  return { wallet, provider };
}

export { config, explorerAddress };
