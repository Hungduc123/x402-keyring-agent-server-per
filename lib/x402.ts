import { createX402Server } from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
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
  "send-token": "0.001",
  "send-native": "0.001",
  "send-nft": "0.001",
  "add-pool": "0.003",
} as const;

// Human-readable label for the one payment option we accept. The OpenAPI doc
// renders this; keep it in step with NETWORK.
export const PAY_LABEL = "USDC on Base";

// Human-readable purpose of each paid route, used for the route description the
// 402 challenge carries. Keyed the same as PRICES_USD so the two stay in step.
const DESCRIPTIONS = {
  "send-token": "Pay the send-token execution fee (ERC-20 transfer)",
  "send-native": "Pay the send-native execution fee (native coin transfer)",
  "send-nft": "Pay the send-nft execution fee (ERC-721/1155 transfer)",
  "add-pool": "Pay the add-pool execution fee (add liquidity to a Uniswap V3 pool)",
} as const satisfies Record<keyof typeof PRICES_USD, string>;

// Discovery metadata for one paid route, in the Bazaar extension shape that
// indexers (x402scan) read off the 402 challenge.
//
// createX402Server auto-injects a bazaar declaration, but the auto-built one
// carries only { type, method } — no input schema — which is what makes
// x402scan warn "Paid endpoint is missing an input schema". Declaring it
// explicitly overrides that default and clears the warning.
//
// The routes are bare paywalls: they read no query params and no body, so the
// input schema is legitimately an empty object. Empty is not the same as
// absent — this states "takes no parameters", which is what an agent needs to
// know to call the endpoint correctly.
function bazaarDeclaration() {
  return declareDiscoveryExtension({
    input: {},
    inputSchema: { type: "object", properties: {}, required: [] },
    output: { example: { status: "ok" } },
  });
}

// The CDP-backed resource server. Routes are declared here rather than at the
// handler: this map is what the server matches an incoming request against to
// find its price, so the "METHOD /path" keys must match the real route paths.
//
// Top-level await — this module is imported only by Node-runtime route handlers,
// never by middleware or the edge runtime, so the await resolves at module load.
export const server = await createX402Server({
  payToConfig: { type: "address", evm: payToAddress },
  routes: Object.fromEntries(
    (Object.keys(PRICES_USD) as (keyof typeof PRICES_USD)[]).map((name) => [
      `GET /api/${name}`,
      {
        price: `$${PRICES_USD[name]}`,
        description: DESCRIPTIONS[name],
        networks: [NETWORK],
        extensions: bazaarDeclaration(),
      },
    ])
  ),
});
