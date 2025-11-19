import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { TxHash, type Capsule } from "@aztec/aztec.js/tx";
import { SentTx } from "@aztec/aztec.js/contracts";
import { type AztecNode } from "@aztec/aztec.js/node";
import { type ContractArtifact, type FunctionCall } from "@aztec/aztec.js/abi";
import { type FeePaymentMethod } from "@aztec/aztec.js/fee";
import { type Wallet } from "@aztec/aztec.js/wallet";
import type { ContractInstance } from "@aztec/stdlib/contract";
import { Hex } from "ox";
import { BaseAccount } from "../account.js";
import {
	LiteralArtifactStrategy,
	type IArtifactStrategy,
} from "../artifacts.js";
import type { AvmChain } from "../chains.js";
import type { Contract, IntentAction } from "../contract.js";
import {
	encodeCapsules,
	encodeFunctionCall,
	encodeRegisterContracts,
} from "../serde.js";
import type { Eip1193Provider, TypedEip1193Provider } from "../types.js";
import { getAvmChain, toAuthWitnessAction } from "../utils.js";

export { BatchCall, Contract } from "../contract.js";

export class Eip1193Account extends BaseAccount {
	/** The RPC provider to send requests to the wallet. */
	readonly provider: TypedEip1193Provider;

	constructor(
		address: AztecAddress,
		provider: Eip1193Provider,
		aztecNode: AztecNode,
		private readonly artifactStrategy: IArtifactStrategy,
		private readonly avmChain: AvmChain
	) {
		super(address, aztecNode);
		this.provider = provider as TypedEip1193Provider;
	}

	// TODO: return a promise that resolves to `SentTxWithHash`
	sendTransaction(
		txRequest: TransactionRequest | Promise<TransactionRequest>
	): SentTx {
		const txHashPromise = (async () => {
			const txRequest_ = await txRequest;
			return this.provider.request({
				method: "aztec_sendTransaction",
				params: [
					{
						chainId: Hex.fromNumber(this.avmChain.id),
						from: this.address.toString(),
						calls: txRequest_.calls.map(encodeFunctionCall),
						authWitnesses: await Promise.all(
							(txRequest_?.authWitnesses ?? []).map(async (x) => ({
								caller: x.caller.toString(),
								action: encodeFunctionCall(await toAuthWitnessAction(x.action)),
							}))
						),
						capsules: encodeCapsules(txRequest_?.capsules ?? []),
						registerContracts: await encodeRegisterContracts({
							contracts: txRequest_?.registerContracts ?? [],
							artifactStrategy: this.artifactStrategy,
						}),
					},
				],
			});
		})().then((x) => TxHash.fromString(x));

		return new SentTx(this.aztecNode, () => txHashPromise);
	}

	// TODO: rename to either `call` or `view` or `readContract` or something more descriptive
	async simulateTransaction(
		txRequest: SimulateTransactionRequest
	): Promise<Fr[][]> {
		// avoid unnecessary calls
		if (txRequest.calls.length === 0) {
			return [];
		}

		const results = await this.provider.request({
			method: "aztec_call",
			params: [
				{
					chainId: Hex.fromNumber(this.avmChain.id),
					from: this.address.toString(),
					calls: txRequest.calls.map((x) => encodeFunctionCall(x)),
					registerContracts: await encodeRegisterContracts({
						contracts: txRequest.registerContracts ?? [],
						artifactStrategy: this.artifactStrategy,
					}),
					registerSenders: txRequest.registerSenders?.map((x) => x.toString()),
				},
			],
		});

		return results.map((result) => result.map((x) => new Fr(BigInt(x))));
	}

	// Note: fromAztec method removed as PXE is no longer exported from aztec.js
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
> & {
	registerSenders?: AztecAddress[];
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
