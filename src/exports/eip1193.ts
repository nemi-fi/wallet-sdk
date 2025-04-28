import {
  AztecAddress,
  computeAuthWitMessageHash,
  Fr,
  FunctionType,
  SentTx,
  TxHash,
  type AztecNode,
  type Capsule,
  type ContractArtifact,
  type FeePaymentMethod,
  type FunctionAbi,
  type FunctionCall,
  type IntentInnerHash,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import { getCanonicalAuthRegistry } from "@aztec/protocol-contracts/auth-registry";
import type { ABIParameterVisibility } from "@aztec/stdlib/abi";
import type { ContractInstance } from "@aztec/stdlib/contract";
import {
  LiteralArtifactStrategy,
  type IArtifactStrategy,
} from "../artifacts.js";
import type { Contract, IntentAction, SendOptions } from "../contract.js";
import { ContractFunctionInteraction } from "../contract.js";
import { createEip1193ProviderFromAccounts } from "../createEip1193ProviderFromAccounts.js";
import {
  encodeCapsules,
  encodeFunctionCall,
  encodeRegisterContracts,
} from "../serde.js";
import type { Eip1193Provider, TypedEip1193Provider } from "../types.js";

export { BatchCall, Contract } from "../contract.js";

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
    txRequest: SimulateTransactionRequest,
  ): Promise<Fr[][]> {
    // avoid unnecessary calls
    if (txRequest.calls.length === 0) {
      return [];
    }

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
    pxe: PXE,
    paymentMethod?: FeePaymentMethod,
  ): Eip1193Account {
    const provider = createEip1193ProviderFromAccounts(
      aztecNode,
      pxe,
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

  public async setPublicAuthWit(
    messageHashOrIntent: Fr | Uint8Array | IntentInnerHash | IntentAction,
    authorized: boolean,
    options?: SendOptions,
  ): Promise<ContractFunctionInteraction> {
    let messageHash: Fr;
    if (messageHashOrIntent instanceof Uint8Array) {
      messageHash = Fr.fromBuffer(Buffer.from(messageHashOrIntent));
    } else if (messageHashOrIntent instanceof Fr) {
      messageHash = messageHashOrIntent;
    } else {
      const chainId = new Fr(await this.aztecNode.getChainId());
      const version = new Fr(await this.aztecNode.getVersion());
      messageHash = await computeAuthWitMessageHash(messageHashOrIntent, {
        chainId,
        version,
      });
    }

    return new ContractFunctionInteraction(
      await getCanonicalAuthRegistry(),
      this,
      this.getSetAuthorizedAbi(),
      [messageHash, authorized],
      options,
    );
  }

  private getSetAuthorizedAbi(): FunctionAbi {
    return {
      name: "set_authorized",
      isInitializer: false,
      functionType: FunctionType.PUBLIC,
      isInternal: true,
      isStatic: false,
      parameters: [
        {
          name: "message_hash",
          type: { kind: "field" },
          visibility: "private" as ABIParameterVisibility,
        },
        {
          name: "authorize",
          type: { kind: "boolean" },
          visibility: "private" as ABIParameterVisibility,
        },
      ],
      returnTypes: [],
      errorTypes: {},
    };
  }
}

export type TransactionRequest = {
  calls: FunctionCall[];
  authWitnesses?: IntentAction[];
  capsules?: Capsule[];
  registerContracts?: RegisterContract[];
};

export type SimulateTransactionRequest = Pick<
  TransactionRequest,
  "calls" | "registerContracts"
>;

export type RegisterContract =
  // for easy API
  | Contract<any>
  // provide optional instance and artifact (if not provided, fetch from node or artifact store)
  | {
      address: AztecAddress;
      instance?: ContractInstance;
      artifact?: ContractArtifact;
    };
