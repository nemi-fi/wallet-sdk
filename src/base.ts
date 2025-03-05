import type { AztecNode } from "@aztec/aztec.js";
import { uniqBy } from "lodash-es";
import { persisted } from "svelte-persisted-store";
import { reactive } from "svelte-reactive";
import {
  derived,
  get,
  readonly,
  writable,
  type Readable,
  type Writable,
} from "svelte/store";
import type { AsyncOrSync } from "ts-essentials";
import type { FallbackOpenPopup } from "./Communicator.js";
import { InjectedAdapter, requestEip6963Providers } from "./injected.js";
import type { Account, Eip1193Provider, RpcRequestMap } from "./types.js";
import { resolveAztecNode } from "./utils.js";

export class AztecWalletSdk {
  readonly #aztecNode: () => Promise<AztecNode>;
  readonly #account = writable<Account | undefined>(undefined);
  readonly accountObservable = readonly(this.#account);

  readonly #currentAdapterUuid = persisted<string | null>(
    "aztec-wallet-current-adapter-uuid",
    null,
  );
  readonly #specifiedAdapters: Writable<readonly IAdapter[]>;
  readonly #injectedAdapters: Readable<readonly IAdapter[]>;
  readonly #adapters: Readable<readonly IAdapter[]>;
  readonly #currentAdapter: Readable<IAdapter | undefined>;
  readonly fallbackOpenPopup: FallbackOpenPopup | undefined;

  constructor(params: {
    aztecNode: AztecNodeInput;
    adapters: (IAdapter | ((sdk: AztecWalletSdk) => IAdapter))[];
    fallbackOpenPopup?: FallbackOpenPopup;
  }) {
    this.#aztecNode = resolveAztecNode(params.aztecNode);
    this.fallbackOpenPopup = params.fallbackOpenPopup;

    this.#specifiedAdapters = writable(
      params.adapters.map((x) => (typeof x === "function" ? x(this) : x)),
    );
    this.#injectedAdapters = derived(requestEip6963Providers(), (providers) =>
      providers.map((p) => new InjectedAdapter(p)),
    );
    this.#adapters = reactive(($) =>
      uniqBy(
        [...$(this.#specifiedAdapters), ...$(this.#injectedAdapters)],
        (x) => x.info.uuid,
      ),
    );
    this.#currentAdapter = reactive(($) => {
      const currentAdapterUuid = $(this.#currentAdapterUuid);
      return $(this.#adapters).find((a) => a.info.uuid === currentAdapterUuid);
    });

    const currentAddress = reactive(($) => {
      const adapter = $(this.#currentAdapter);
      if (!adapter) {
        return undefined;
      }
      return $(adapter.accountObservable);
    });

    let accountId = 0;
    currentAddress.subscribe(async (address) => {
      const thisAccountId = ++accountId;

      // async code after this line

      const account = address ? await this.#toAccount(address) : undefined;

      // prevent race condition
      if (thisAccountId !== accountId) {
        return;
      }

      this.#account.set(account);
    });
  }

  /**
   * Returns currently selected account if any.
   */
  getAccount() {
    return get(this.#account);
  }

  async connect(providerUuid: string) {
    this.#currentAdapterUuid.set(providerUuid);
    if (!this.#adapter) {
      throw new Error(`no provider found for ${providerUuid}`);
    }
    const address = await this.#adapter.connect();
    if (!address) {
      throw new Error("Failed to connect");
    }
    return await this.#toAccount(address);
  }

  async reconnect() {
    if (!this.#adapter) {
      return;
    }

    const address = await this.#adapter.reconnect();
    if (!address) {
      return undefined;
    }
    return await this.#toAccount(address);
  }

  async disconnect() {
    if (!this.#adapter) {
      return;
    }
    await this.#adapter.disconnect();
  }

  async watchAssets(
    assets: Parameters<RpcRequestMap["wallet_watchAssets"]>[0]["assets"],
  ) {
    await this.#provider.request({
      method: "wallet_watchAssets",
      params: [{ assets }],
    });
  }

  get adapters(): readonly Eip6963ProviderInfo[] {
    return get(this.#adapters).map((x) => x.info);
  }

  get #adapter() {
    return get(this.#currentAdapter);
  }

  get #provider() {
    if (!this.#adapter) {
      throw new Error("provider not connected");
    }
    return this.#adapter.provider;
  }

  async #toAccount(address: string) {
    const { AztecAddress } = await import("@aztec/aztec.js");
    const { Eip1193Account } = await import("./exports/eip1193.js");
    return new Eip1193Account(
      AztecAddress.fromString(address),
      this.#provider,
      await this.#aztecNode(),
    );
  }
}

export interface IAdapter {
  readonly info: Eip6963ProviderInfo;
  readonly provider: Eip1193Provider;
  readonly accountObservable: Readable<string | undefined>;
  connect(): Promise<string | undefined>;
  reconnect(): Promise<string | undefined>;
  disconnect(): Promise<void>;
}

export interface Eip6963ProviderInfo {
  readonly uuid: string;
  readonly name: string;
  readonly icon: string;
  // readonly rdns: string; // TODO: careful with this field. Check EIP-6963 spec
}

export type AztecNodeInput =
  | string
  | URL
  | (() => AsyncOrSync<AztecNode>)
  | AsyncOrSync<AztecNode>;
