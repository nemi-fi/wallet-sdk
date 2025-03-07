import type { WalletConnectModalSignOptions } from "@walletconnect/modal-sign-html";
import { getSdkError } from "@walletconnect/utils";
import { readonly, writable, type Writable } from "svelte/store";
import { assert } from "ts-essentials";
import type { IArtifactStrategy } from "./artifacts.js";
import type { Eip6963ProviderInfo, IAdapter } from "./base.js";
import type { PopupAdapter } from "./popup.js";
import type {
  RpcRequest,
  RpcRequestMap,
  TypedEip1193Provider,
} from "./types.js";
import {
  CAIP,
  METHODS_NOT_REQUIRING_CONFIRMATION,
  lazyValue,
} from "./utils.js";

/**
 * @deprecated Use {@link PopupAdapter} instead.
 */
export class ReownAdapter implements IAdapter {
  readonly info: Eip6963ProviderInfo;
  readonly #account: Writable<string | undefined> = writable(undefined);
  readonly accountObservable = readonly(this.#account);

  readonly #options: ConstructorParameters<
    typeof import("@walletconnect/modal-sign-html").WalletConnectModalSign
  >[0];

  readonly #onRequest: OnRpcConfirmationRequest;
  readonly artifactStrategy: IArtifactStrategy;

  constructor(options: ReownAdapterOptions) {
    this.info = {
      uuid: options.uuid,
      name: "Reown",
      icon: "",
    };
    this.#options = {
      projectId: options.projectId,
      metadata: options.metadata ?? DEFAULT_METADATA,
    };
    this.#onRequest = options.onRequest ?? (() => {});
    this.artifactStrategy = options.artifactStrategy;
  }

  #getWeb3Modal = lazyValue(async () => {
    const {
      WalletConnectModalSign,
    }: typeof import("@walletconnect/modal-sign-html/dist/_types/src/client.js") =
      await import("@walletconnect/modal-sign-html");
    const web3modal = new WalletConnectModalSign({
      ...this.#options,
      modalOptions: {
        ...this.#options.modalOptions,
        chains: [...(this.#options.modalOptions?.chains ?? []), CAIP.chain()],
      },
    });
    web3modal.onSessionDelete(() => {
      console.log("session delete");
      this.#account.set(undefined);
    });
    web3modal.onSessionExpire(() => {
      console.log("session expire");
      this.#account.set(undefined);
    });
    web3modal.onSessionEvent((e) => {
      const { event } = e.params;
      if (event.name !== "accountsChanged") {
        return;
      }
      const newAddress = event.data[0];
      this.#account.set(newAddress);
    });
    return web3modal;
  });

  /**
   * Opens a WalletConnect modal and connects to the user's wallet.
   *
   * Call this when user clicks a "Connect wallet" button.
   *
   * @returns the connected account
   */
  async connect() {
    const web3modal = await this.#getWeb3Modal();
    await web3modal.connect({});
    return await this.reconnect();
  }

  /**
   * Reconnects to the user's wallet if was previously connected.
   *
   * Call this on page refresh.
   *
   * @returns the connected account
   */
  async reconnect() {
    const address = await this.#getSelectedAccount();
    this.#account.set(address);
    return address;
  }

  /**
   * Disconnects from the user's wallet.
   */
  async disconnect() {
    const session = await this.#getSession();
    if (session) {
      const web3modal = await this.#getWeb3Modal();
      await web3modal.disconnect({
        topic: session.topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
    }
    this.#account.set(undefined);
  }

  async #getSelectedAccount() {
    const session = await this.#getSession();
    if (!session) {
      return undefined;
    }
    const addresses = await this.provider.request({
      method: "aztec_accounts",
      params: [],
    });
    const address = addresses[0];
    if (address == null) {
      return undefined;
    }
    return address;
  }

  async #getSession() {
    const web3modal = await this.#getWeb3Modal();
    const session = await web3modal.getSession();
    return session;
  }

  provider: TypedEip1193Provider = {
    request: async (request) => {
      const abortController = new AbortController();
      if (!METHODS_NOT_REQUIRING_CONFIRMATION.includes(request.method)) {
        this.#onRequest(request, abortController);
      }

      try {
        const session = await this.#getSession();
        assert(session, "no session");
        const web3modal = await this.#getWeb3Modal();
        const result = await web3modal.request({
          chainId: CAIP.chain(),
          topic: session.topic,
          request,
        });
        return result as any;
      } finally {
        abortController.abort();
      }
    },
  };
}

export const DEFAULT_METADATA = {
  name: "Example dApp",
  description: "",
  url: "https://example.com",
  icons: [],
};

export type ReownAdapterOptions = {
  /** EIP-6963 provider UUID */
  readonly uuid: string;

  /** Reown project ID */
  projectId: string;
  /** Reown metadata */
  metadata?: WalletConnectModalSignOptions["metadata"];

  artifactStrategy: IArtifactStrategy;
  onRequest?: OnRpcConfirmationRequest;
};

export type OnRpcConfirmationRequest<
  K extends keyof RpcRequestMap = keyof RpcRequestMap,
> = (request: RpcRequest<K>, controller: AbortController) => unknown;
