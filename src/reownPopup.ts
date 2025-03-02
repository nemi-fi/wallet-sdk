import type { UniversalProviderOpts } from "@walletconnect/universal-provider";
import { persisted } from "svelte-persisted-store";
import {
  get,
  readonly,
  writable,
  type Readable,
  type Writable,
} from "svelte/store";
import { assert } from "ts-essentials";
import { joinURL } from "ufo";
import { BaseWalletSdk, type AztecNodeInput } from "./base.js";
import { Communicator, type FallbackOpenPopup } from "./Communicator.js";
import { DEFAULT_METADATA } from "./reown.js";
import type {
  Account,
  RpcRequest,
  RpcRequestMap,
  TypedEip1193Provider,
} from "./types.js";
import {
  accountFromAddress,
  CAIP,
  DEFAULT_WALLET_URL,
  FINAL_METHODS,
  lazyValue,
  METHODS_NOT_REQUIRING_CONFIRMATION,
} from "./utils.js";

// TODO: remove this class. It's a temporary hack to make Obsidion wallet work. Needed to not show a popup on every `aztec_call` RPC call.
export class ReownPopupWalletSdk
  extends BaseWalletSdk
  implements TypedEip1193Provider
{
  readonly #communicator: Communicator;
  #pendingRequestsCount = 0;

  readonly #connectedAccountAddress = persisted<string | null>(
    "aztec-wallet-connected-address",
    null,
  );

  readonly #account: Writable<Account | undefined> = writable(undefined);
  readonly accountObservable: Readable<Account | undefined> = readonly(
    this.#account,
  );
  readonly #options: UniversalProviderOpts;

  readonly walletUrl: string;

  constructor(
    aztecNode: AztecNodeInput,
    wcOptions: UniversalProviderOpts,
    params: {
      /**
       * Called when user browser blocks a popup. Use this to attempt to re-open the popup.
       * Must call the provided callback right after user clicks a button, so browser does not block it.
       * Browsers usually don't block popups if they are opened within a few milliseconds of a button click.
       */
      fallbackOpenPopup?: FallbackOpenPopup;
      walletUrl?: string;
    } = {},
  ) {
    super(aztecNode);
    this.#options = {
      ...wcOptions,
      metadata: wcOptions.metadata ?? DEFAULT_METADATA,
      projectId: wcOptions.projectId,
    };

    this.walletUrl = params.walletUrl ?? DEFAULT_WALLET_URL;
    this.#communicator = new Communicator({
      url: joinURL(this.walletUrl, "/sign"),
      ...params,
    });

    let accountId = 0;
    this.#connectedAccountAddress.subscribe(async (address) => {
      if (typeof window === "undefined") {
        return;
      }

      const thisAccountId = ++accountId;

      const { AztecAddress } = await import("@aztec/aztec.js");

      const account = address
        ? await accountFromAddress(
            this,
            await this.aztecNode(),
            AztecAddress.fromString(address),
          )
        : undefined;
      if (thisAccountId !== accountId) {
        // prevent race condition
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

  #getReownProvider = lazyValue(async () => {
    const { UniversalProvider } = await import(
      "@walletconnect/universal-provider"
    );
    const provider = await UniversalProvider.init({
      ...this.#options,
    });

    provider.on("session_delete", () => {
      this.#account.set(undefined);
      this.#connectedAccountAddress.set(null);
    });

    provider.on("session_expire", () => {
      this.#account.set(undefined);
      this.#connectedAccountAddress.set(null);
    });

    // Subscribe to session update
    provider.on("session_update", (topic: string, params: any) => {
      // TODO: update...
    });

    provider.on("session_event", async (e: any) => {
      const { AztecAddress } = await import("@aztec/aztec.js");
      const { event } = e.params;
      if (event.name !== "accountsChanged") {
        return;
      }
      const newAddress = event.data[0];
      this.#account.set(
        await accountFromAddress(
          this,
          await this.aztecNode(),
          AztecAddress.fromString(newAddress),
        ),
      );
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

  /**
   * Opens a WalletConnect modal and connects to the user's wallet.
   *
   * Call this when user clicks a "Connect wallet" button.
   *
   * @returns the connected account
   */
  async connect() {
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

    const result = await this.request({
      method: "aztec_requestAccounts",
      params: [],
    });
    const [address] = result;
    assert(address, "No accounts found");

    await sessionPromise;

    const { AztecAddress } = await import("@aztec/aztec.js");
    const account = await accountFromAddress(
      this,
      await this.aztecNode(),
      AztecAddress.fromString(address),
    );
    this.#account.set(account);
    this.#connectedAccountAddress.set(address);
    return account;
  }

  /**
   * Disconnects from the user's wallet.
   */
  async disconnect() {
    const session = await this.#getSession();
    if (session) {
      const provider = await this.#getReownProvider();
      await provider.disconnect();
    }
    this.#account.set(undefined);
    this.#connectedAccountAddress.set(null);
  }

  async #getSession() {
    const provider = await this.#getReownProvider();
    return provider.session;
  }

  /**
   * Sends a raw RPC request to the user's wallet.
   */
  request: TypedEip1193Provider["request"] = async (request) => {
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
