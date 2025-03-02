import type { AztecNode } from "@aztec/aztec.js";
import type { AsyncOrSync } from "ts-essentials";
import type { RpcRequestMap, TypedEip1193Provider } from "./types.js";
import { resolveAztecNode } from "./utils.js";

// keep inheritance tree short
export abstract class BaseWalletSdk implements TypedEip1193Provider {
  protected readonly aztecNode: () => AsyncOrSync<MinimalAztecNode>;

  constructor(node: AztecNodeInput) {
    this.aztecNode = resolveAztecNode(node);
  }

  async watchAssets(
    assets: Parameters<RpcRequestMap["wallet_watchAssets"]>[0]["assets"],
  ) {
    await this.request({
      method: "wallet_watchAssets",
      params: [{ assets }],
    });
  }

  abstract request: TypedEip1193Provider["request"];
}

export type AztecNodeInput =
  | string
  | URL
  | (() => AsyncOrSync<MinimalAztecNode>)
  | AsyncOrSync<MinimalAztecNode>;

/**
 * Used to fetch public data only
 */
// TODO: replace with just `AztecNode` instead of picking a few methods
export type MinimalAztecNode = Pick<
  AztecNode,
  // methods used in `SentTx`
  | "getTxEffect"
  | "getTxReceipt"
  | "getPublicLogs"
  | "getProvenBlockNumber"
  // other methods
  | "getContract"
  | "getContractClass"
>;
