import type { Capsule } from "@aztec/aztec.js/tx";
import type { FunctionCall } from "@aztec/aztec.js/abi";
import type { ContractInstance } from "@aztec/stdlib/contract";
import { Hex } from "ox";
import type { IArtifactStrategy } from "./artifacts.js";
import type { RegisterContract } from "./exports/eip1193.js";
import type { SerializedCapsule, SerializedContractInstance } from "./types.js";

export function encodeFunctionCall(call: FunctionCall) {
	return {
		to: call.to.toString(),
		selector: call.selector.toString(),
		args: call.args.map((x) => x.toString()),
	};
}

export function encodeCapsules(capsules: Capsule[]): SerializedCapsule[] {
	return capsules.map((c) => ({
		contract: c.contractAddress.toString(),
		storageSlot: c.storageSlot.toString(),
		data: c.data.map((x) => x.toString()),
	}));
}

// TODO: this function must be sync in order for browser popups to work. `serializeArtifact` takes too much time and browser blocks the popup because the time difference between user clicking the button and the window.open call is too big.
export async function encodeRegisterContracts({
	contracts,
	artifactStrategy,
}: {
	contracts: RegisterContract[];
	artifactStrategy: IArtifactStrategy;
}) {
	return await Promise.all(
		contracts.map(async (x) => ({
			address: x.address.toString(),
			instance: x.instance ? encodeContractInstance(x.instance) : undefined,
			artifact: x.artifact
				? await artifactStrategy.serializeArtifact(x.artifact)
				: undefined,
		}))
	);
}

function encodeContractInstance(
	instance: ContractInstance
): SerializedContractInstance {
	return {
		version: Hex.fromNumber(instance.version),
		salt: instance.salt.toString(),
		deployer: instance.deployer.toString(),
		originalContractClassId: instance.originalContractClassId.toString(),
		currentContractClassId: instance.currentContractClassId.toString(),
		initializationHash: instance.initializationHash.toString(),
		publicKeys: instance.publicKeys.toString(),
	};
}

export async function decodeContractInstance(
	data: SerializedContractInstance
): Promise<ContractInstance> {
	const { AztecAddress } = await import("@aztec/aztec.js/addresses");
	const { Fr } = await import("@aztec/aztec.js/fields");
	const { PublicKeys } = await import("@aztec/aztec.js/keys");
	return {
		version: Hex.toNumber(
			data.version satisfies string as Hex.Hex
		) as ContractInstance["version"],
		salt: Fr.fromString(data.salt),
		deployer: AztecAddress.fromString(data.deployer),
		originalContractClassId: Fr.fromString(data.originalContractClassId),
		currentContractClassId: Fr.fromString(data.currentContractClassId),
		initializationHash: Fr.fromString(data.initializationHash),
		publicKeys: PublicKeys.fromString(data.publicKeys),
	};
}
