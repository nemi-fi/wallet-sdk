import type { PXE } from "@aztec/aztec.js";
import type { AsyncOrSync } from "ts-essentials";
import { resolveAztecNode } from "./utils.js";

// keep inheritance tree short
export class BaseWalletSdk {
  protected readonly aztecNode: () => AsyncOrSync<MinimalAztecNode>;

  constructor(node: AztecNodeInput) {
    this.aztecNode = resolveAztecNode(node);
  }
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
