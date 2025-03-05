import {
  AztecAddress,
  Fr,
  SentTx,
  TxHash,
  type AztecNode,
  type ContractArtifact,
  type FunctionCall,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import { type ContractInstance } from "@aztec/circuits.js";
import type { Capsule, Contract, IntentAction } from "../contract.js";
import { createEip1193ProviderFromAccounts } from "../createEip1193ProviderFromAccounts.js";
import { encodeFunctionCall, encodeRegisterContracts } from "../serde.js";
import type { Eip1193Provider, TypedEip1193Provider } from "../types.js";

export { BatchCall, Contract, type IntentAction } from "../contract.js";

export class Eip1193Account {
  /** The RPC provider to send requests to the wallet. */
  readonly provider: TypedEip1193Provider;

  constructor(
    /** The address of the account. */
    readonly address: AztecAddress,
    provider: Eip1193Provider,
    /** Aztec node to fetch public data */
    readonly aztecNode: AztecNode,
  ) {
    this.provider = provider as TypedEip1193Provider;
  }

  // for compatibility with aztec.js `Wallet`. Decide whether to keep this or not
  getAddress() {
    return this.address;
  }

  // TODO: return a promise that resolves to `SentTxWithHash`
  sendTransaction(
    txRequest: TransactionRequest | Promise<TransactionRequest>,
  ): SentTx {
    const txHashPromise = (async () => {
      const txRequest_ = await txRequest;
      return this.provider.request({
        method: "aztec_sendTransaction",
        params: [
          {
            from: this.address.toString(),
            calls: await Promise.all(txRequest_.calls.map(encodeFunctionCall)),
            authWitnesses: await Promise.all(
              (txRequest_?.authWitnesses ?? []).map(async (x) => ({
                caller: x.caller.toString(),
                action: await encodeFunctionCall(x.action),
              })),
            ),
            capsules: (txRequest_?.capsules ?? []).map((capsule) =>
              capsule.map((x) => x.toString()),
            ),
            registerContracts: await encodeRegisterContracts(
              txRequest_.registerContracts ?? [],
            ),
          },
        ],
      });
    })().then((x) => TxHash.fromString(x));

    return new SentTx(this.aztecNode as unknown as PXE, txHashPromise);
  }

  // TODO: rename to either `call` or `view` or `readContract` or something more descriptive
  async simulateTransaction(
    txRequest: Pick<TransactionRequest, "calls" | "registerContracts">,
  ): Promise<Fr[][]> {
    const results = await this.provider.request({
      method: "aztec_call",
      params: [
        {
          from: this.address.toString(),
          calls: await Promise.all(
            txRequest.calls.map((x) => encodeFunctionCall(x)),
          ),
          registerContracts: await encodeRegisterContracts(
            txRequest.registerContracts ?? [],
          ),
        },
      ],
    });

    return results.map((result) => result.map((x) => new Fr(BigInt(x))));
  }

  /**
   * @deprecated only use to convert aztec.js account to `Eip1193Account` for compatibility reasons
   */
  static fromAztec(account: Wallet, aztecNode: AztecNode): Eip1193Account {
    const provider = createEip1193ProviderFromAccounts(aztecNode, [account]);
    return new this(account.getAddress(), provider, aztecNode);
  }
}

export type TransactionRequest = {
  calls: FunctionCall[];
  authWitnesses?: IntentAction[];
  capsules?: Capsule[];
  registerContracts?: RegisterContract[];
};

export type RegisterContract =
  // for easy API
  | Contract<any>
  // provide optional instance and artifact (if not provided, fetch from node or artifact store)
  | {
      address: AztecAddress;
      instance?: ContractInstance;
      artifact?: ContractArtifact;
    };
