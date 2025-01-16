import type { Fr, FunctionCall } from "@aztec/aztec.js";
import type { FunctionType } from "@aztec/foundation/abi";
import { Bytes, Hex } from "ox";
import { assert } from "ts-essentials";
import type { SerializedFunctionCall } from "./types.js";

interface SerdeItem<T, S> {
  serialize(value: T): Promise<S>;
  deserialize(value: S): Promise<T>;
}
interface Serde {
  FunctionCall: SerdeItem<FunctionCall, SerializedFunctionCall>;
  FrArray: SerdeItem<Fr[], string>;
}

/**
 * @deprecated TODO: think of a better way to do this (serialize as a string using ClassConverter)
 */
export const serde: Serde = {
  FunctionCall: {
    serialize: async (fc) => ({
      selector: fc.selector.toString(),
      name: fc.name,
      type: fc.type,
      isStatic: fc.isStatic,
      to: fc.to.toString(),
      args: fc.args.map((fr) => fr.toString()),
      returnTypes: fc.returnTypes,
    }),
    deserialize: async (fc) => {
      const { Fr, AztecAddress, FunctionSelector } = await import(
        "@aztec/aztec.js"
      );
      return {
        selector: FunctionSelector.fromString(fc.selector),
        name: fc.name,
        type: fc.type as FunctionType,
        isStatic: fc.isStatic,
        to: AztecAddress.fromString(fc.to),
        args: fc.args.map((fr) => new Fr(BigInt(fr))),
        returnTypes: fc.returnTypes,
      };
    },
  },

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
        Fr.fromString(Hex.fromBytes(Bytes.slice(bytes, i * 32, 32))),
      );
    },
  },
};
