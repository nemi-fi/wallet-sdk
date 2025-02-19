import type { FunctionCall, PXE } from "@aztec/aztec.js";
import type { SerializedFunctionCall } from "./types.js";

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

  const instance = await pxe.getContractMetadata(to);
  if (!instance.contractInstance) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract instance found for ${to}`);
  }
  const contractArtifact = await pxe.getContractClassMetadata(
    instance.contractInstance.contractClassId,
    true, // includeArtifact
  );
  if (!contractArtifact.artifact) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract artifact found for ${to}`);
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
    throw new Error(`no function artifact found for ${to}`);
  }

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
