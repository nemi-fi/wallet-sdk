import type {
  AztecAddress,
  ContractArtifact,
  FunctionCall,
  FunctionSelector,
  PXE,
} from "@aztec/aztec.js";
import type { ContractInstance } from "@aztec/circuits.js";
import { Hex } from "ox";
import type { RegisterContract } from "./exports/eip1193.js";
import type {
  SerializedContractArtifact,
  SerializedContractInstance,
  SerializedFunctionCall,
  SerializedRegisterContract,
} from "./types.js";

export async function encodeFunctionCall(call: FunctionCall) {
  return {
    to: call.to.toString(),
    selector: call.selector.toString(),
    args: call.args.map((x) => x.toString()),
  };
}

export async function decodeFunctionCall(pxe: PXE, fc: SerializedFunctionCall) {
  const { AztecAddress, FunctionSelector, Fr } = await import(
    "@aztec/aztec.js"
  );

  const to = AztecAddress.fromString(fc.to);
  const selector = FunctionSelector.fromString(fc.selector);
  const args = fc.args.map((x) => Fr.fromHexString(x));

  const artifact = await getContractFunctionAbiFromPxe(pxe, to, selector);

  const call: FunctionCall = {
    to,
    selector,
    args,
    name: artifact.name,
    type: artifact.functionType,
    isStatic: artifact.isStatic,
    returnTypes: artifact.returnTypes,
  };
  return call;
}

export async function getContractFunctionAbiFromPxe(
  pxe: PXE,
  address: AztecAddress,
  selector: FunctionSelector,
) {
  const { FunctionSelector } = await import("@aztec/aztec.js");

  const instance = await pxe.getContractMetadata(address);
  if (!instance.contractInstance) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract instance found for ${address}`);
  }
  const contractArtifact = await pxe.getContractClassMetadata(
    instance.contractInstance.contractClassId,
    true,
  );
  if (!contractArtifact.artifact) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract artifact found for ${address}`);
  }
  const artifact = (
    await Promise.all(
      contractArtifact.artifact.functions.map(async (f) => {
        const s = await FunctionSelector.fromNameAndParameters(
          f.name,
          f.parameters,
        );
        return s.equals(selector) ? f : undefined;
      }),
    )
  ).find((f) => f != null);
  if (!artifact) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no function artifact found for ${address}`);
  }
  return artifact;
}

export async function encodeRegisterContracts(contracts: RegisterContract[]) {
  return await Promise.all(
    contracts.map(async (x) => ({
      address: x.address.toString(),
      instance: x.instance
        ? await encodeContractInstance(x.instance)
        : undefined,
      artifact: x.artifact
        ? await encodeContractArtifact(x.artifact)
        : undefined,
    })),
  );
}

export async function decodeRegisterContracts(
  data: SerializedRegisterContract[],
) {
  const { AztecAddress } = await import("@aztec/aztec.js");
  return await Promise.all(
    data.map(async (x) => ({
      address: AztecAddress.fromString(x.address),
      instance: x.instance
        ? await decodeContractInstance(x.instance)
        : undefined,
      artifact: x.artifact
        ? await decodeContractArtifact(x.artifact)
        : undefined,
    })),
  );
}

async function encodeContractInstance(
  instance: ContractInstance,
): Promise<SerializedContractInstance> {
  return {
    version: Hex.fromNumber(instance.version),
    salt: instance.salt.toString(),
    deployer: instance.deployer.toString(),
    contractClassId: instance.contractClassId.toString(),
    initializationHash: instance.initializationHash.toString(),
    publicKeys: instance.publicKeys.toString(),
  };
}

async function decodeContractInstance(
  data: SerializedContractInstance,
): Promise<ContractInstance> {
  const { AztecAddress, Fr, PublicKeys } = await import("@aztec/aztec.js");
  return {
    version: Hex.toNumber(
      data.version satisfies string as Hex.Hex,
    ) as ContractInstance["version"],
    salt: Fr.fromString(data.salt),
    deployer: AztecAddress.fromString(data.deployer),
    contractClassId: Fr.fromString(data.contractClassId),
    initializationHash: Fr.fromString(data.initializationHash),
    publicKeys: PublicKeys.fromString(data.publicKeys),
  };
}

async function encodeContractArtifact(
  artifact: ContractArtifact,
): Promise<SerializedContractArtifact> {
  const { jsonStringify } = await import("@aztec/foundation/json-rpc");
  return jsonStringify(artifact);
}

async function decodeContractArtifact(
  data: SerializedContractArtifact,
): Promise<ContractArtifact> {
  const { jsonParseWithSchema } = await import("@aztec/foundation/json-rpc");
  const { ContractArtifactSchema } = await import("@aztec/foundation/abi");
  return jsonParseWithSchema(data, ContractArtifactSchema);
}
