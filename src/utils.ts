import type { AztecNode } from "@aztec/aztec.js";
import type { AztecNodeInput } from "./base.js";
import type { TransactionRequest } from "./exports/index.js";
import type { RpcRequestMap } from "./types.js";

const CAIP_PREFIX = "aztec";
const AZTEC_CHAIN_ID = "418719321"; // TODO
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
    const { createAztecNodeClient } = await import("@aztec/aztec.js");
    let aztecNode = getAztecNodeFn();
    if (typeof aztecNode === "string" || aztecNode instanceof URL) {
      aztecNode = createAztecNodeClient(new URL(aztecNode).href);
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

export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private readonly defaultValue: () => V) {
    super();
  }

  get(key: K): V {
    let value = super.get(key);
    if (value == null) {
      value = this.defaultValue();
      this.set(key, value);
    }
    return value;
  }
}

export function mergeTransactionRequests(
  requests: TransactionRequest[],
): Required<TransactionRequest> {
  return {
    calls: requests.flatMap((r) => r.calls),
    authWitnesses: requests.flatMap((r) => r.authWitnesses ?? []),
    capsules: requests.flatMap((r) => r.capsules ?? []),
    registerContracts: requests.flatMap((r) => r.registerContracts ?? []),
    registerSenders: requests.flatMap((r) => r.registerSenders ?? []),
  };
}

export async function getAztecChainId(aztecNode: AztecNode) {
  const l1ChainId = await aztecNode.getChainId();
  switch (l1ChainId) {
    case 1115511:
      return 418719321; // keccak256('aztec-testnet')[0:4]
    case 31337:
      return 147120760; // keccak256('aztec-sandbox')[0:4]
    default:
      throw new Error(`Unsupported L1 chain ID: ${l1ChainId}`);
  }
}
