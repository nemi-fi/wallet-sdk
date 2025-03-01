import {
  type AztecAddress,
  type Contract as AztecContract,
  type ContractArtifact,
  type ContractInstanceWithAddress,
  type DeployMethod,
  type FunctionCall,
  type Wallet,
} from "@aztec/aztec.js";
import {
  decodeFromAbi,
  encodeArguments,
  FunctionSelector,
  type FunctionAbi,
} from "@aztec/foundation/abi";
import type { Eip1193Account, TransactionRequest } from "./exports/eip1193.js";
import { lazyValue } from "./utils.js";

// TODO: consider changing the API to be more viem-like. I.e., use `contract.write.methodName` and `contract.read.methodName`
export class ContractBase<T extends AztecContract> {
  readonly methods: {
    [K in keyof T["methods"]]: ContractMethod<T, K>;
  };

  protected constructor(
    /** Deployed contract instance. */
    readonly instance: ContractInstanceWithAddress,
    /** The Application Binary Interface for the contract. */
    readonly artifact: ContractArtifact,
    /** The account used for interacting with this contract. */
    readonly account: Eip1193Account,
  ) {
    this.methods = artifact.functions.reduce(
      (acc, f) => {
        acc[f.name as keyof T["methods"]] = Object.assign(
          (...argsAndOptions: any[]) => {
            const [args, options = {}] =
              argsAndOptions.length === f.parameters.length
                ? [argsAndOptions, {}]
                : [
                    argsAndOptions.slice(0, -1),
                    argsAndOptions[argsAndOptions.length - 1],
                  ];
            return new ContractFunctionInteraction(
              this, // TODO: is this memory leak?
              this.account,
              f,
              args,
              options,
            );
          },
          {
            async selector() {
              return await FunctionSelector.fromNameAndParameters(
                f.name,
                f.parameters,
              );
            },
          },
        );
        return acc;
      },
      {} as typeof this.methods,
    );
  }

  get address() {
    return this.instance.address;
  }

  /** @deprecated use `withAccount` */
  withWallet = this.withAccount.bind(this);
  withAccount(account: Eip1193Account): Contract<T> {
    return new Contract<T>(this.instance, this.artifact, account);
  }
}

export class Contract<T extends AztecContract> extends ContractBase<T> {
  static async at<T extends AztecContract = AztecContract>(
    address: AztecAddress,
    artifact: ContractArtifact,
    account: Eip1193Account,
  ) {
    const contractInstance = await account.aztecNode.getContract(address);
    if (contractInstance == null) {
      throw new Error(`Contract at ${address.toString()} not found`);
    }
    return new Contract<T>(contractInstance, artifact, account);
  }

  static fromAztec<T extends AztecContract>(
    original: {
      deploy: (deployer: Wallet, ...args: any[]) => DeployMethod<T>;
    },
    artifact: ContractArtifact,
  ) {
    const ContractClass = class extends ContractBase<T> {
      static async at(address: AztecAddress, account: Eip1193Account) {
        return await Contract.at<T>(address, artifact, account);
      }

      static deploy(...args: Parameters<(typeof original)["deploy"]>) {
        return original.deploy(...args);
      }

      static get artifact() {
        return artifact;
      }
    };
    return ContractClass;
  }
}

class ContractFunctionInteraction {
  readonly #account: Eip1193Account;
  readonly #functionAbi: FunctionAbi;
  readonly #call: () => Promise<FunctionCall>;
  readonly #txRequest: () => Promise<Required<TransactionRequest>>;

  constructor(
    contract: Contract<AztecContract>,
    account: Eip1193Account,
    functionAbi: FunctionAbi,
    args: unknown[],
    options: SendOptions | undefined,
  ) {
    this.#account = account;
    this.#functionAbi = functionAbi;

    this.#call = lazyValue(async () => {
      return {
        name: this.#functionAbi.name,
        args: encodeArguments(this.#functionAbi, args),
        selector: await FunctionSelector.fromNameAndParameters(
          this.#functionAbi.name,
          this.#functionAbi.parameters,
        ),
        type: this.#functionAbi.functionType,
        to: contract.address,
        isStatic: this.#functionAbi.isStatic,
        returnTypes: this.#functionAbi.returnTypes,
      };
    });
    this.#txRequest = lazyValue(async () => {
      return {
        calls: [await this.#call()],
        authWitnesses: options?.authWitnesses ?? [],
        registerContracts: [contract],
      };
    });
  }

  send() {
    return this.#account.sendTransaction(this.#txRequest());
  }

  async simulate() {
    const results = await this.#account.simulateTransaction(
      await this.#txRequest(),
    );
    if (results.length !== 1) {
      throw new Error(`invalid results length: ${results.length}`);
    }
    const result = results[0]!;
    return decodeFromAbi(this.#functionAbi.returnTypes, result);
  }

  async request(): Promise<FunctionCall> {
    return await this.#call();
  }
}

export class BatchCall
  implements Pick<ReturnType<ContractMethod<any, any>>, "send">
{
  constructor(
    readonly account: Eip1193Account,
    readonly calls: FunctionCall[],
    readonly options?: SendOptions,
  ) {}

  send() {
    return this.account.sendTransaction({
      ...this.options,
      calls: this.calls,
    });
  }
}

export type IntentAction = {
  caller: AztecAddress;
  action: FunctionCall;
};

type SendOptions = Pick<
  TransactionRequest,
  "authWitnesses" | "registerContracts"
>;

type ContractMethod<T extends AztecContract, K extends keyof T["methods"]> = ((
  ...args: [...Parameters<T["methods"][K]>, options?: SendOptions]
) => ContractFunctionInteraction) & {
  selector(): Promise<FunctionSelector>;
};
