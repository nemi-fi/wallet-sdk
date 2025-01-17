import {
  DeployMethod,
  type AztecAddress,
  type Contract as AztecContract,
  type ContractArtifact,
  type FunctionCall,
  type Wallet,
} from "@aztec/aztec.js";
import {
  decodeFromAbi,
  encodeArguments,
  FunctionSelector,
  type FunctionAbi,
} from "@aztec/foundation/abi";
import type { Eip1193Account } from "./exports/eip1193.js";
import { serde } from "./serde.js";

// TODO: consider changing the API to be more viem-like. I.e., use `contract.write.methodName` and `contract.read.methodName`
export class ContractBase<T extends AztecContract> {
  readonly methods: {
    [K in keyof T["methods"]]: ContractMethod<T, K>;
  };

  protected constructor(
    /** Address of the deployed contract instance. */
    readonly address: AztecAddress,
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
              this.address,
              this.account,
              f,
              args,
              options,
            );
          },
          {
            get selector() {
              return FunctionSelector.fromNameAndParameters(
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

  /** @deprecated use `withAccount` */
  withWallet = this.withAccount.bind(this);
  withAccount(account: Eip1193Account): Contract<T> {
    return new Contract<T>(this.address, this.artifact, account);
  }
}

export class Contract<T extends AztecContract> extends ContractBase<T> {
  static async at<T extends AztecContract = AztecContract>(
    address: AztecAddress,
    artifact: ContractArtifact,
    account: Eip1193Account,
  ) {
    return new Contract<T>(address, artifact, account);
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
    };
    return Object.assign(ContractClass, {
      /**
       * @deprecated use only for deploying contracts until deploy over wallet RPC is implemented
       */
      original,
    });
  }
  /** @deprecated TODO: remove this alias */
  static wrap = this.fromAztec.bind(this);
}
export namespace Contract {
  export type Infer<T extends { at: (...args: any[]) => any }> = Awaited<
    ReturnType<T["at"]>
  >;
}

class ContractFunctionInteraction {
  constructor(
    private address: AztecAddress,
    private account: Eip1193Account,
    private functionAbi: FunctionAbi,
    private args: unknown[],
    private options: SendOptions | undefined,
  ) {}

  send() {
    return this.account.sendTransaction({
      ...this.options,
      calls: [this.request()],
    });
  }

  async simulate() {
    const call = this.request();
    const results = await this.account.simulateTransaction({
      ...this.options,
      calls: [call],
    });
    if (results.length !== 1) {
      throw new Error(`invalid results length: ${results.length}`);
    }
    const result = results[0]!;
    return decodeFromAbi(
      this.functionAbi.returnTypes,
      await serde.FrArray.deserialize(result),
    );
  }

  // TODO: convert to lazyValue
  request(): FunctionCall {
    const encodedArgs = encodeArguments(this.functionAbi, this.args);
    return {
      name: this.functionAbi.name,
      args: encodedArgs,
      selector: FunctionSelector.fromNameAndParameters(
        this.functionAbi.name,
        this.functionAbi.parameters,
      ),
      type: this.functionAbi.functionType,
      to: this.address,
      isStatic: this.functionAbi.isStatic,
      returnTypes: this.functionAbi.returnTypes,
    };
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

// TODO: import from `@aztec/aztec.js` when it is exported (version 0.70.x)
export type IntentAction = {
  caller: AztecAddress;
  action: FunctionCall;
};

type SendOptions = {
  authWitnesses?: IntentAction[];
};

type ContractMethod<T extends AztecContract, K extends keyof T["methods"]> = ((
  ...args: [...Parameters<T["methods"][K]>, options?: SendOptions]
) => ContractFunctionInteraction) & {
  selector: FunctionSelector;
};
