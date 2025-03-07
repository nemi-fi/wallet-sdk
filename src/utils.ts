import type { AztecNode } from "@aztec/aztec.js";
import type { AztecNodeInput } from "./base.js";
import type { RpcRequestMap } from "./types.js";

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

export function resolveAztecNode(
  getAztecNode: AztecNodeInput,
): () => Promise<AztecNode> {
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

export async function request({
  url,
  method,
  body,
}: {
  url: string;
  method: string;
  body?: unknown;
}) {
  const response = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText} | ${await response.text()}`,
    );
  }
  return await response.json();
}
