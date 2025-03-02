import type { AztecAddress } from "@aztec/aztec.js";
import type { AztecNodeInput, MinimalAztecNode } from "./base.js";
import type { Eip1193Provider, RpcRequestMap } from "./types.js";

const CAIP_PREFIX = "aztec";
const AZTEC_CHAIN_ID = "1";
export const CAIP = {
  chain() {
    return `${CAIP_PREFIX}:${AZTEC_CHAIN_ID}`;
  },
  address(address: string) {
    return `${CAIP_PREFIX}:${AZTEC_CHAIN_ID}:${address.toLowerCase()}`;
  },
};

export const DEFAULT_WALLET_URL = "https://app.obsidion.xyz";

export const METHODS_NOT_REQUIRING_CONFIRMATION: (keyof RpcRequestMap)[] = [
  "aztec_accounts",
  "aztec_call",
];

export const FINAL_METHODS: readonly (keyof RpcRequestMap)[] = [
  "aztec_requestAccounts",
  "aztec_sendTransaction",
  "wallet_watchAssets",
];

export function lazyValue<T>(fn: () => T) {
  let value: T;
  let initialized = false;
  return () => {
    if (!initialized) {
      initialized = true;
      value = fn();
    }
    return value;
  };
}

export async function accountFromAddress(
  provider: Eip1193Provider,
  aztecNode: MinimalAztecNode,
  address: AztecAddress,
) {
  const { Eip1193Account } = await import("./exports/eip1193.js");
  return new Eip1193Account(address, provider, aztecNode);
}

export function resolveAztecNode(
  getAztecNode: AztecNodeInput,
): () => Promise<MinimalAztecNode> {
  const getAztecNodeFn =
    typeof getAztecNode === "function" ? getAztecNode : () => getAztecNode;
  return lazyValue(async () => {
    const { createAztecNodeClient, makeFetch } = await import(
      "@aztec/aztec.js"
    );
    let aztecNode = getAztecNodeFn();
    if (typeof aztecNode === "string" || aztecNode instanceof URL) {
      const noRetryFetch = makeFetch([], true); // disable retires. May need to enable in the future for resilience. Probably retries even mutating requests.
      aztecNode = createAztecNodeClient(
        new URL(aztecNode).href,
        undefined,
        noRetryFetch,
      );
    }
    return aztecNode;
  });
}

export type ParametersExceptFirst<F> = F extends (
  arg0: any,
  ...rest: infer R
) => any
  ? R
  : never;
