import type { UniversalProviderOpts } from "@walletconnect/universal-provider";
import { persisted } from "svelte-persisted-store";
import { derived, type Readable, type Writable } from "svelte/store";
import { joinURL } from "ufo";
import type { Eip6963ProviderInfo, IAdapter } from "./base.js";
import { Communicator } from "./Communicator.js";
import type { PopupAdapterOptions } from "./popup.js";
import { DEFAULT_METADATA, type ReownAdapterOptions } from "./reown.js";
import type {
  RpcRequest,
  RpcRequestMap,
  TypedEip1193Provider,
} from "./types.js";
import {
  CAIP,
  FINAL_METHODS,
  lazyValue,
  METHODS_NOT_REQUIRING_CONFIRMATION,
} from "./utils.js";

// TODO: remove this class. It's a temporary hack to make Obsidion wallet work. Needed to not show a popup on every `aztec_call` RPC call.
export class ReownPopupAdapter implements IAdapter {
  readonly info: Eip6963ProviderInfo;
  readonly #communicator: Communicator;
  #pendingRequestsCount = 0;

  readonly #connectedAccountAddress: Writable<string | null>;
  readonly accountObservable: Readable<string | undefined>;

  readonly #options: UniversalProviderOpts;

  readonly walletUrl: string;

  constructor(params: ReownPopupAdapterOptions) {
    this.info = { uuid: params.uuid, name: params.name, icon: params.icon };
    this.#options = {
      metadata: DEFAULT_METADATA,
      projectId: params.projectId,
    };

    this.walletUrl = params.walletUrl;
    this.#communicator = new Communicator({
      url: joinURL(this.walletUrl, "/sign"),
      ...params,
    });

    this.#connectedAccountAddress = persisted<string | null>(
      `aztec-wallet-connected-address-${params.uuid}`,
      null,
    );
    this.accountObservable = derived(
      this.#connectedAccountAddress,
      (x) => x ?? undefined,
    );
  }

  #getReownProvider = lazyValue(async () => {
    const { UniversalProvider } = await import(
      "@walletconnect/universal-provider"
    );
    const provider = await UniversalProvider.init({
      ...this.#options,
    });

    provider.on("session_delete", () => {
      this.#connectedAccountAddress.set(null);
    });

    provider.on("session_expire", () => {
      this.#connectedAccountAddress.set(null);
    });

    // Subscribe to session update
    provider.on("session_update", (topic: string, params: any) => {
      // TODO: update...
    });

    provider.on("session_event", (e: any) => {
      const { event } = e.params;
      if (event.name !== "accountsChanged") {
        return;
      }
      const newAddress = event.data[0];
      this.#connectedAccountAddress.set(newAddress);
    });

    return provider;
  });

  async getReownProviderUri(provider: any): Promise<string> {
    return new Promise((resolve) => {
      provider.on("display_uri", (uri: string) => {
        resolve(uri);
      });
    });
  }

  // New helper to send reownUri to the popup
  private async sendReownUriToPopup(uri: string) {
    // Ensure the popup is loaded and accessible
    const popup = await this.#communicator.waitForPopupLoaded();
    // Send a custom message with the reownUri
    popup.postMessage(
      { event: "SetReownUri", reownUri: uri },
      this.walletUrl + "/sign",
    );
  }

  async connect() {
    // must be first to ensure the browser opens the popup
    const result = this.provider.request({
      method: "aztec_requestAccounts",
      params: [],
    });

    const provider = await this.#getReownProvider();
    const sessionPromise = provider.connect({
      namespaces: {
        aztec: {
          chains: [CAIP.chain()],
          methods: METHODS_NOT_REQUIRING_CONFIRMATION.map((method) => method),
          events: ["accountsChanged"],
        },
      },
    });
    const uri = await this.getReownProviderUri(provider);
    await this.sendReownUriToPopup(uri);

    const [address] = await result;

    await sessionPromise;

    this.#connectedAccountAddress.set(address ?? null);
    return address;
  }

  async reconnect() {
    return undefined;
  }

  async disconnect() {
    const session = await this.#getSession();
    if (session) {
      const provider = await this.#getReownProvider();
      await provider.disconnect();
    }
    this.#connectedAccountAddress.set(null);
  }

  async #getSession() {
    const provider = await this.#getReownProvider();
    return provider.session;
  }

  provider: TypedEip1193Provider = {
    request: async (request) => {
      const abortController = new AbortController();
      if (METHODS_NOT_REQUIRING_CONFIRMATION.includes(request.method)) {
        try {
          const provider = await this.#getReownProvider();
          const result = await provider.request(request, CAIP.chain());
          return result as any;
        } finally {
          abortController.abort();
        }
      } else {
        return await this.#requestPopup(request);
      }
    },
  };

  async #requestPopup<M extends keyof RpcRequestMap>(
    request: RpcRequest<M>,
  ): Promise<ReturnType<RpcRequestMap[M]>> {
    this.#pendingRequestsCount++;
    // TODO: handle batch requests
    try {
      const rpcRequest = {
        id: crypto.randomUUID(),
        jsonrpc: "2.0",
        method: request.method,
        params: request.params,
      };
      const response: any = (
        await this.#communicator.postRequestAndWaitForResponse({
          requestId: crypto.randomUUID(),
          data: rpcRequest,
        })
      )?.data;
      if ("error" in response) {
        throw new Error(JSON.stringify(response.error));
      }
      return response.result;
    } finally {
      this.#pendingRequestsCount--;

      const disconnectIfNoPendingRequests = () => {
        if (this.#pendingRequestsCount <= 0) {
          this.#communicator.disconnect();
        }
      };

      if (FINAL_METHODS.includes(request.method)) {
        disconnectIfNoPendingRequests();
      } else {
        setTimeout(disconnectIfNoPendingRequests, 1000);
      }
    }
  }
}

export interface ReownPopupAdapterOptions
  extends ReownAdapterOptions,
    PopupAdapterOptions {}
