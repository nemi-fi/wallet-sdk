import {
  AztecAddress,
  encodeArguments,
  FeeJuicePaymentMethod,
  Fr,
  SentTx,
  type AztecNode,
  type FeePaymentMethod,
  type FunctionCall,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import { ExecutionPayload } from "@aztec/entrypoints/payload";
import {
  decodeFromAbi,
  FunctionType,
  type ABIParameter,
  type FunctionAbi,
} from "@aztec/stdlib/abi";
import { GasSettings } from "@aztec/stdlib/gas";
import type { TxSimulationResult } from "@aztec/stdlib/tx";
import { assert } from "ts-essentials";
import type { IntentAction } from "./contract.js";
import {
  decodeCapsules,
  decodeFunctionCall,
  decodeRegisterContract,
  getContractFunctionAbiFromPxe,
} from "./serde.js";
import type {
  RpcRequestMap,
  SerializedRegisterContract,
  TypedEip1193Provider,
} from "./types.js";

export function createEip1193ProviderFromAccounts(
  aztecNode: AztecNode,
  pxe: PXE,
  accounts: Wallet[],
  paymentMethod?: FeePaymentMethod,
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
            pxe,
            request.registerContracts ?? [],
          );

          // decode calls
          const calls = await Promise.all(
            request.calls.map((x) => decodeFunctionCall(pxe, x)),
          );

          // approve auth witnesses
          const authWitRequests: IntentAction[] = await Promise.all(
            request.authWitnesses.map(async (authWitness) => ({
              caller: AztecAddress.fromString(authWitness.caller),
              action: await decodeFunctionCall(pxe, authWitness.action),
            })),
          );
          const authWitnesses = await Promise.all(
            authWitRequests.map((authWitRequest) =>
              account.createAuthWit(authWitRequest),
            ),
          );

          const payload = new ExecutionPayload(
            calls,
            authWitnesses,
            await decodeCapsules(request.capsules ?? []),
          );

          // sign the tx
          const txRequest = await account.createTxExecutionRequest(
            payload,
            await getDefaultFee(account, paymentMethod),
            {},
          );
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
            pxe,
            request.registerContracts ?? [],
          );

          const deserializedCalls = await Promise.all(
            request.calls.map((x) => decodeFunctionCall(pxe, x)),
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
              if (current.type === FunctionType.UTILITY) {
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
                pxe,
                call.to,
                call.selector,
              );
              return [
                await account.simulateUtility(
                  call.name,
                  call.args.map((arg, i) =>
                    decodeFromAbi([fnAbi.parameters[i]!.type], [arg]),
                  ),
                  call.to,
                  [],
                  account.getAddress(),
                ),
                index,
              ] as const;
            },
          );

          let simulatedTxPromise: Promise<TxSimulationResult> | undefined;
          if (indexedCalls.length !== 0) {
            const payload = new ExecutionPayload(
              indexedCalls.map(([call]) => call),
              [],
              [],
            );
            const txRequest = await account.createTxExecutionRequest(
              payload,
              await getDefaultFee(account, paymentMethod),
              {},
            );
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

async function getDefaultFee(
  account: Wallet,
  paymentMethod: FeePaymentMethod | undefined,
) {
  paymentMethod ??= new FeeJuicePaymentMethod(account.getAddress());
  return {
    gasSettings: GasSettings.default({
      maxFeesPerGas: (await account.getCurrentBaseFees()).mul(2n), // TODO: find a better fee strategy
    }),
    paymentMethod,
  };
}

registerContracts.wasRegistered = new Set<string>();
async function registerContracts(
  aztecNode: AztecNode,
  pxe: PXE,
  serialized: SerializedRegisterContract[],
) {
  await Promise.all(
    serialized.map(async (data) => {
      const registeringKey = data.address.toLowerCase();
      // deduplicate registration requests
      if (registerContracts.wasRegistered.has(registeringKey)) {
        return;
      }

      const c = await decodeRegisterContract(data);
      const instance = c.instance ?? (await aztecNode.getContract(c.address));
      if (!instance) {
        // fails the whole RPC call if instance not found
        throw new Error(`no contract instance found for ${c.address}`);
      }

      const artifact =
        c.artifact ??
        // TODO: try to fetch artifact from aztecscan or a similar service
        (
          await pxe.getContractClassMetadata(
            instance.currentContractClassId,
            true,
          )
        ).artifact;
      if (!artifact) {
        // fails the whole RPC call if artifact not found
        throw new Error(`no contract artifact found for ${c.address}`);
      }

      const contract = {
        instance: {
          ...instance,
          address: c.address,
        },
        artifact,
      };

      if (typeof process !== "undefined" && process.env.CI) {
        // TODO: fails CI without this line. More info: https://discord.com/channels/1144692727120937080/1365069273281724486
        await aztecNode.getNodeInfo();
      }
      await pxe.registerContract(contract);
      registerContracts.wasRegistered.add(registeringKey);
    }),
  );
}
