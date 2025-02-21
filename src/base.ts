import type { PXE } from "@aztec/aztec.js";
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
  | (() => AsyncOrSync<MinimalAztecNode>)
  | AsyncOrSync<MinimalAztecNode>;

/**
 * Used to fetch public data only
 */
// TODO: remove this once aztec.js makes `AztecNode` type usable
export type MinimalAztecNode = Pick<
  PXE, // should be `AztecNode`
  // methods used in `SentTx`
  "getTxEffect" | "getTxReceipt" | "getPublicLogs" | "getProvenBlockNumber"
>;
