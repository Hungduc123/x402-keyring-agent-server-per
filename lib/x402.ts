import { createX402Server } from "@coinbase/cdp-sdk/x402";
import type { Address } from "viem";

// Base mainnet (CAIP-2). Payments settle in USDC here, via the CDP facilitator
// that createX402Server wires up automatically — there is no facilitator URL or
// bearer token to configure.
export const NETWORK = "eip155:8453";

// EVM account that receives the payments. payToConfig.type "address" means CDP
// does NOT provision a wallet for us: funds go straight to this address and no
// CDP_WALLET_SECRET is needed — only the API key pair for the facilitator.
const payTo = process.env.EVM_ADDRESS as Address | undefined;
if (!payTo) {
  throw new Error(
    "EVM_ADDRESS environment variable is required (your Base payout address, 0x…)",
  );
}
if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
  throw new Error(
    `EVM_ADDRESS must be an EVM address (0x… , 42 chars), got: ${payTo}`,
  );
}
export const payToAddress: Address = payTo;

// Per-route price, in USD. Shared with the OpenAPI doc so discovery and the 402
// challenge agree. The three routes are the same paywall over three different
// wallet actions, priced by how much value each one moves.
export const PRICES_USD = {
  "send-token": "0.05",
  "send-native": "0.05",
  "send-nft": "0.05",
  "add-pool": "3",
} as const;

// Human-readable label for the one payment option we accept. The OpenAPI doc
// renders this; keep it in step with NETWORK.
export const PAY_LABEL = "USDC on Base";

// The CDP-backed resource server. Routes are declared here rather than at the
// handler: this map is what the server matches an incoming request against to
// find its price, so the "METHOD /path" keys must match the real route paths.
//
// Top-level await — this module is imported only by Node-runtime route handlers,
// never by middleware or the edge runtime, so the await resolves at module load.
export const server = await createX402Server({
  payToConfig: { type: "address", evm: payToAddress },
  routes: {
    "GET /api/send-token": {
      price: `$${PRICES_USD["send-token"]}`,
      description: "Pay the send-token execution fee (ERC-20 transfer)",
      networks: [NETWORK],
    },
    "GET /api/send-native": {
      price: `$${PRICES_USD["send-native"]}`,
      description: "Pay the send-native execution fee (native coin transfer)",
      networks: [NETWORK],
    },
    "GET /api/send-nft": {
      price: `$${PRICES_USD["send-nft"]}`,
      description: "Pay the send-nft execution fee (ERC-721/1155 transfer)",
      networks: [NETWORK],
    },
    "GET /api/add-pool": {
      price: `$${PRICES_USD["add-pool"]}`,
      description: "Pay the add-pool execution fee (add liquidity to a pool)",
      networks: [NETWORK],
    },
  },
});
