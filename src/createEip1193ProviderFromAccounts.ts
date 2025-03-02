import {
  AztecAddress,
  encodeArguments,
  Fr,
  NoFeePaymentMethod,
  SentTx,
  type AztecNode,
  type FunctionCall,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import type { TxSimulationResult } from "@aztec/circuit-types";
import { GasSettings } from "@aztec/circuits.js";
import {
  decodeFromAbi,
  FunctionType,
  type ABIParameter,
  type FunctionAbi,
} from "@aztec/foundation/abi";
import { assert } from "ts-essentials";
import type { IntentAction } from "./contract.js";
import {
  decodeFunctionCall,
  decodeRegisterContracts,
  getContractFunctionAbiFromPxe,
} from "./serde.js";
import type {
  RpcRequestMap,
  SerializedRegisterContract,
  TypedEip1193Provider,
} from "./types.js";

export function createEip1193ProviderFromAccounts(
  aztecNode: AztecNode,
  accounts: Wallet[],
) {
  function getAccount(address: string) {
    const account = accounts.find((a) => a.getAddress().toString() === address);
    assert(account, `no account found for ${address}`);
    return account;
  }
  const provider: TypedEip1193Provider = {
    async request(params) {
      params = JSON.parse(JSON.stringify(params)); // ensure (de)serialization works

      const methodMap: {
        [K in keyof RpcRequestMap]: (
          ...args: Parameters<RpcRequestMap[K]>
        ) => Promise<ReturnType<RpcRequestMap[K]>>;
      } = {
        aztec_sendTransaction: async (request) => {
          const account = getAccount(request.from);

          // register contracts
          await registerContracts(
            aztecNode,
            account,
            request.registerContracts ?? [],
          );

          // decode calls
          const calls = await Promise.all(
            request.calls.map((x) => decodeFunctionCall(account, x)),
          );

          // approve auth witnesses
          const authWitRequests: IntentAction[] = await Promise.all(
            request.authWitnesses.map(async (authWitness) => ({
              caller: AztecAddress.fromString(authWitness.caller),
              action: await decodeFunctionCall(account, authWitness.action),
            })),
          );
          for (const authWitRequest of authWitRequests) {
            await account.createAuthWit(authWitRequest);
          }

          // add capsules
          const capsules = request.capsules.map((capsule) =>
            capsule.map((x) => new Fr(BigInt(x))),
          );
          for (const capsule of capsules) {
            await account.addCapsule(capsule);
          }

          // sign the tx
          const txRequest = await account.createTxExecutionRequest({
            calls,
            fee: await getDefaultFee(account),
          });
          const simulatedTx = await account.simulateTx(txRequest, true);
          const tx = await account.proveTx(
            txRequest,
            simulatedTx.privateExecutionResult,
          );
          const txHash = await new SentTx(
            account,
            account.sendTx(tx.toTx()),
          ).getTxHash();
          return txHash.toString();
        },
        aztec_call: async (request) => {
          const account = getAccount(request.from);

          // register contracts
          await registerContracts(
            aztecNode,
            account,
            request.registerContracts ?? [],
          );

          const deserializedCalls = await Promise.all(
            request.calls.map((x) => decodeFunctionCall(account, x)),
          );
          const { indexedCalls, unconstrained } = deserializedCalls.reduce<{
            /** Keep track of the number of private calls to retrieve the return values */
            privateIndex: 0;
            /** Keep track of the number of public calls to retrieve the return values */
            publicIndex: 0;
            /** The public and private function calls in the batch */
            indexedCalls: [FunctionCall, number, number][];
            /** The unconstrained function calls in the batch. */
            unconstrained: [FunctionCall, number][];
          }>(
            (acc, current, index) => {
              if (current.type === FunctionType.UNCONSTRAINED) {
                acc.unconstrained.push([current, index]);
              } else {
                acc.indexedCalls.push([
                  current,
                  index,
                  current.type === FunctionType.PRIVATE
                    ? acc.privateIndex++
                    : acc.publicIndex++,
                ]);
              }
              return acc;
            },
            {
              indexedCalls: [],
              unconstrained: [],
              publicIndex: 0,
              privateIndex: 0,
            },
          );

          const unconstrainedCalls = unconstrained.map(
            async ([call, index]) => {
              const fnAbi = await getContractFunctionAbiFromPxe(
                account,
                call.to,
                call.selector,
              );
              return [
                await account.simulateUnconstrained(
                  call.name,
                  call.args.map((arg, i) =>
                    decodeFromAbi([fnAbi.parameters[i]!.type], [arg]),
                  ),
                  call.to,
                  account.getAddress(),
                ),
                index,
              ] as const;
            },
          );

          let simulatedTxPromise: Promise<TxSimulationResult> | undefined;
          if (indexedCalls.length !== 0) {
            const txRequest = await account.createTxExecutionRequest({
              calls: indexedCalls.map(([call]) => call),
              fee: await getDefaultFee(account),
            });
            simulatedTxPromise = account.simulateTx(
              txRequest,
              true, // simulatePublic
              undefined, // TODO: use account.getAddress() when fixed https://github.com/AztecProtocol/aztec-packages/issues/11278
              false,
            );
          }

          const [unconstrainedResults, simulatedTx] = await Promise.all([
            Promise.all(unconstrainedCalls),
            simulatedTxPromise,
          ]);

          const results: Fr[][] = [];

          for (const [result, index] of unconstrainedResults) {
            // TODO: remove encoding logic when fixed https://github.com/AztecProtocol/aztec-packages/issues/11275
            let returnTypes = deserializedCalls[index]!.returnTypes;
            if (returnTypes.length === 1 && returnTypes[0]?.kind === "tuple") {
              returnTypes = returnTypes[0]!.fields;
            }
            const paramsAbi: ABIParameter[] = returnTypes.map((type, i) => ({
              type,
              name: `result${i}`,
              visibility: "public",
            }));
            const encoded = encodeArguments(
              { parameters: paramsAbi } as FunctionAbi,
              Array.isArray(result) ? result : [result],
            );
            results[index] = encoded;
          }
          if (simulatedTx) {
            for (const [call, callIndex, resultIndex] of indexedCalls) {
              // As account entrypoints are private, for private functions we retrieve the return values from the first nested call
              // since we're interested in the first set of values AFTER the account entrypoint
              // For public functions we retrieve the first values directly from the public output.
              const rawReturnValues =
                call.type == FunctionType.PRIVATE
                  ? simulatedTx.getPrivateReturnValues()?.nested?.[resultIndex]
                      ?.values
                  : simulatedTx.getPublicReturnValues()[resultIndex]?.values;
              results[callIndex] = rawReturnValues ?? [];
            }
          }
          return results.map((result) => result.map((x) => x.toString()));
        },
        aztec_requestAccounts: async () => {
          return accounts.map((a) => a.getAddress().toString());
        },
        aztec_accounts: async () => {
          return accounts.map((a) => a.getAddress().toString());
        },
        wallet_watchAssets: async () => {},
      };

      let result = await methodMap[params.method](...params.params);
      result = JSON.parse(JSON.stringify(result)); // ensure (de)serialization works
      return result;
    },
  };

  return provider;
}

async function getDefaultFee(aztecNode: Pick<AztecNode, "getCurrentBaseFees">) {
  return {
    gasSettings: GasSettings.default({
      maxFeesPerGas: await aztecNode.getCurrentBaseFees(),
    }),
    paymentMethod: new NoFeePaymentMethod(),
  };
}

async function registerContracts(
  aztecNode: AztecNode,
  pxe: PXE,
  serialized: SerializedRegisterContract[],
) {
  const contracts = await Promise.all(
    (await decodeRegisterContracts(serialized)).map(async (c) => {
      const instance = c.instance ?? (await aztecNode.getContract(c.address));
      if (!instance) {
        // fails the whole RPC call if instance not found
        throw new Error(`no contract instance found for ${c.address}`);
      }

      const artifact =
        c.artifact ??
        // TODO: try to fetch artifact from aztecscan or a similar service
        (await pxe.getContractClassMetadata(instance.contractClassId, true))
          .artifact;
      if (!artifact) {
        // fails the whole RPC call if artifact not found
        throw new Error(`no contract artifact found for ${c.address}`);
      }

      return {
        instance: {
          ...instance,
          address: c.address,
        },
        artifact,
      };
    }),
  );
  for (const contract of contracts) {
    await pxe.registerContract(contract);
  }
}
