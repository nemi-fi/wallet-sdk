import type { ContractArtifact } from "@aztec/aztec.js";
import { joinURL } from "ufo";
import type { SerializedContractArtifact } from "./types.js";
import { lazyValue, request } from "./utils.js";

export interface IArtifactStrategy {
  serializeArtifact(
    artifact: ContractArtifact,
  ): Promise<SerializedContractArtifact>;
}

export class LiteralArtifactStrategy implements IArtifactStrategy {
  async serializeArtifact(artifact: ContractArtifact) {
    return {
      type: "literal",
      literal: artifact,
    } satisfies SerializedContractArtifact;
  }
}

export class ShieldSwapArtifactStrategy implements IArtifactStrategy {
  #cachedUrls = new Map<string, Promise<string>>();

  constructor(readonly apiUrl = "https://registry.obsidion.xyz/artifacts") {}

  static getDefaultSingleton = lazyValue(
    () => new ShieldSwapArtifactStrategy(),
  );

  async serializeArtifact(artifact: ContractArtifact) {
    const url = await this.#fetchOrUpload(artifact);
    return {
      type: "url",
      url,
    } satisfies SerializedContractArtifact;
  }

  async #fetchOrUpload(artifact: ContractArtifact) {
    const id = await getContractArtifactId(artifact);
    let urlPromise = this.#cachedUrls.get(id);
    if (!urlPromise) {
      urlPromise = (async () => {
        let url = await request({
          method: "GET",
          url: joinURL(this.apiUrl, `?id=${id}`),
        });
        if (!url) {
          url = (await request({
            method: "POST",
            url: this.apiUrl,
            body: artifact,
          })) as string;
        }
        return url;
      })();
      this.#cachedUrls.set(id, urlPromise);
    }
    return urlPromise;
  }
}

export async function getContractArtifactId(artifact: ContractArtifact) {
  const { computeArtifactHash } = await import("@aztec/stdlib/contract");
  return (await computeArtifactHash(artifact)).toString();
}
