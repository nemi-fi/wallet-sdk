import type { Fr, FunctionCall, PXE } from "@aztec/aztec.js";
import { Bytes, Hex } from "ox";
import { assert } from "ts-essentials";
import type { SerializedFunctionCall } from "./types.js";

interface SerdeItem<T, S> {
  serialize(value: T): Promise<S>;
  deserialize(value: S): Promise<T>;
}
interface Serde {
  FrArray: SerdeItem<Fr[], string>;
}

/**
 * @deprecated TODO: think of a better way to do this (serialize as a string using ClassConverter)
 */
export const serde: Serde = {
  FrArray: {
    serialize: async (frs) => {
      return Hex.concat(...frs.map((fr) => fr.toString()));
    },
    deserialize: async (frs) => {
      const { Fr } = await import("@aztec/aztec.js");
      const bytes = Bytes.fromHex(frs satisfies string as Hex.Hex);
      const length = bytes.length / 32;
      assert(Number.isInteger(length), "invalid Fr[] length");
      // TODO(perf): remove unnecessary conversions. https://discord.com/channels/1144692727120937080/1329303808135794771
      return Array.from({ length }, (_, i) =>
        Fr.fromString(
          Hex.fromBytes(
            Bytes.slice(bytes, i * 32, i * 32 + 32, { strict: true }),
          ),
        ),
      );
    },
  },
};

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

  const instance = await pxe.getContractInstance(to);
  if (!instance) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract instance found for ${to}`);
  }
  const contractArtifact = await pxe.getContractArtifact(
    instance.contractClassId,
  );
  if (!contractArtifact) {
    // TODO(security): can leak privacy by fingerprinting what contracts are added to user's PXE
    throw new Error(`no contract artifact found for ${to}`);
  }
  const artifact = contractArtifact.functions.find((f) =>
    FunctionSelector.fromNameAndParameters(f.name, f.parameters).equals(
      selector,
    ),
  );
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
