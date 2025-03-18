import {
  Fr,
  TxHash,
  Capsule,
  SentTx,
  type FunctionCall,
  type Wallet,
  type FeePaymentMethod,
  type ContractArtifact,
} from "@aztec/aztec.js";
import type { ContractInstance } from "@aztec/stdlib/contract";
import {
  LiteralArtifactStrategy,
  type IArtifactStrategy,
} from "../artifacts.js";
import type { Contract, IntentAction } from "../contract.js";
import { createEip1193ProviderFromAccounts } from "../createEip1193ProviderFromAccounts.js";
import {
  encodeCapsules,
  encodeFunctionCall,
  encodeRegisterContracts,
} from "../serde.js";
import type { Eip1193Provider, TypedEip1193Provider } from "../types.js";
import type { AztecNode } from "@aztec/stdlib/interfaces/client";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";

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
    private readonly artifactStrategy: IArtifactStrategy,
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
            calls: txRequest_.calls.map(encodeFunctionCall),
            authWitnesses: (txRequest_?.authWitnesses ?? []).map((x) => ({
              caller: x.caller.toString(),
              action: encodeFunctionCall(x.action),
            })),
            capsules: encodeCapsules(txRequest_?.capsules ?? []),
            registerContracts: await encodeRegisterContracts({
              contracts: txRequest_?.registerContracts ?? [],
              artifactStrategy: this.artifactStrategy,
            }),
          },
        ],
      });
    })().then((x) => TxHash.fromString(x));

    return new SentTx(this.aztecNode, txHashPromise);
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
          calls: txRequest.calls.map((x) => encodeFunctionCall(x)),
          registerContracts: await encodeRegisterContracts({
            contracts: txRequest.registerContracts ?? [],
            artifactStrategy: this.artifactStrategy,
          }),
        },
      ],
    });

    return results.map((result) => result.map((x) => new Fr(BigInt(x))));
  }

  /**
   * @deprecated only use to convert aztec.js account to `Eip1193Account` for compatibility reasons
   */
  static fromAztec(
    account: Wallet,
    aztecNode: AztecNode,
    paymentMethod: FeePaymentMethod,
  ): Eip1193Account {
    const provider = createEip1193ProviderFromAccounts(
      aztecNode,
      [account],
      paymentMethod,
    );
    const artifactStrategy = new LiteralArtifactStrategy();
    return new this(
      account.getAddress(),
      provider,
      aztecNode,
      artifactStrategy,
    );
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
