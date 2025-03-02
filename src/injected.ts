import { readonly, writable, type Writable } from "svelte/store";
import type { Eip6963ProviderInfo, IAdapter } from "./base.js";
import type { Eip1193Provider, TypedEip1193Provider } from "./types.js";

export class InjectedAdapter implements IAdapter {
  readonly #account = writable<string | undefined>(undefined);
  readonly accountObservable = readonly(this.#account);

  constructor(private detail: Eip963ProviderDetail) {}

  async connect() {
    const [address] = await this.provider.request({
      method: "aztec_requestAccounts",
      params: [],
    });
    this.#account.set(address);
    return address;
  }

  async reconnect() {
    const [address] = await this.provider.request({
      method: "aztec_accounts",
      params: [],
    });
    this.#account.set(address);
    return address;
  }

  async disconnect() {
    this.#account.set(undefined);
  }

  get info() {
    return this.detail.info;
  }

  get provider(): TypedEip1193Provider {
    return this.detail.provider as TypedEip1193Provider;
  }
}

let providers: Writable<readonly Eip963ProviderDetail[]>;
export function requestEip6963Providers() {
  if (providers) {
    // request only once
    return readonly(providers);
  }

  providers = writable<readonly Eip963ProviderDetail[]>([]);

  if (typeof window === "undefined") {
    // no effect on server
    return readonly(providers);
  }

  // request providers
  const prefix = "azip6963"; // deviate from EIP-6963 spec to not clash with EVM wallets
  window.addEventListener(`${prefix}:announceProvider`, (event: any) => {
    const detail = {
      info: event.info,
      provider: event.provider,
    };
    if (!detail.info || !detail.provider) {
      return;
    }
    providers.update((providers) => [...providers, detail]);
  });

  window.dispatchEvent(new CustomEvent(`${prefix}:requestProviders`));

  return readonly(providers);
}

interface Eip963ProviderDetail {
  readonly info: Eip6963ProviderInfo;
  readonly provider: Eip1193Provider;
}
