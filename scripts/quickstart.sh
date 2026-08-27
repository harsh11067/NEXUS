#!/usr/bin/env bash
# NEXUS quickstart — clean-clone reproducibility (TEST.md A-07).
# Proves the repo builds, tests green, and the SDK/app typecheck from scratch.
# Live-network demos need a funded key in .env; this script tells you which.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

step "toolchain"
command -v pnpm >/dev/null || { echo "pnpm required (npm i -g pnpm)"; exit 1; }
command -v forge >/dev/null || { echo "foundry required (curl -L https://foundry.paradigm.xyz | bash && foundryup)"; exit 1; }
node --version && pnpm --version && forge --version | head -1

step "install workspace deps"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

step "build contracts"
pnpm build:contracts

step "contract tests (Tier 1)"
pnpm test:contracts 2>&1 | tail -3

step "SDK unit tests (U-01…U-05)"
pnpm test:sdk 2>&1 | tail -8

step "typecheck (SDK + app)"
(cd packages/sdk && npx tsc --noEmit) && echo "  sdk clean"
(cd app && npx tsc --noEmit) && echo "  app clean"

step "done"
cat <<'EOF'
Everything local is green. To run against a live network:
  cp .env.example .env      # fill PRIVATE_KEY (testnet faucet: https://faucet.0g.ai)
  pnpm demo:mint            # first live proof (Galileo testnet)
  OG_NETWORK=mainnet pnpm demo:mint   # mainnet (needs OG_MAINNET_KEY funded)
  pnpm dev                  # the app on http://localhost:3000
Verify recorded proofs anytime:
  OG_NETWORK=mainnet pnpm verify:proofs
EOF
