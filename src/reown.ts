import type { WalletConnectModalSignOptions } from "@walletconnect/modal-sign-html";
import { getSdkError } from "@walletconnect/utils";
import {
  get,
  readonly,
  writable,
  type Readable,
  type Writable,
} from "svelte/store";
import { assert } from "ts-essentials";
import { BaseWalletSdk, type AztecNodeInput } from "./base.js";
import type { Eip1193Account } from "./exports/eip1193.js";
import type {
  RpcRequest,
  RpcRequestMap,
  TypedEip1193Provider,
} from "./types.js";
import {
  CAIP,
  METHODS_NOT_REQUIRING_CONFIRMATION,
  accountFromAddress,
  lazyValue,
} from "./utils.js";

/**
 * @deprecated Use PopupWalletSdk instead.
 */
export class ReownWalletSdk
  extends BaseWalletSdk
  implements TypedEip1193Provider
{
  readonly #account: Writable<Eip1193Account | undefined> = writable(undefined);

  readonly accountObservable: Readable<Eip1193Account | undefined> = readonly(
    this.#account,
  );

  /**
   * Returns currently selected account if any.
   */
  getAccount() {
    return get(this.#account);
  }

  readonly #options: ConstructorParameters<
    typeof import("@walletconnect/modal-sign-html").WalletConnectModalSign
  >[0];

  readonly #onRequest: OnRpcConfirmationRequest;

  constructor(
    options: MyWalletConnectOptions,
    aztecNode: AztecNodeInput,
    onRequest: OnRpcConfirmationRequest,
  ) {
    super(aztecNode);
    this.#options = {
      ...options,
      metadata: options.metadata ?? DEFAULT_METADATA,
    };
    this.#onRequest = onRequest ?? (() => {});
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
    web3modal.onSessionEvent(async (e) => {
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
    const account = await this.reconnect();
    if (!account) {
      throw new Error("No accounts found");
    }
    return account;
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
    if (!address) {
      this.#account.set(undefined);
      return undefined;
    }
    const account = await accountFromAddress(
      this,
      await this.aztecNode(),
      address,
    );
    this.#account.set(account);
    return account;
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
    const addresses = await this.request({
      method: "aztec_accounts",
      params: [],
    });
    const address = addresses[0];
    if (address == null) {
      return undefined;
    }
    const { AztecAddress } = await import("@aztec/aztec.js");
    return AztecAddress.fromString(address);
  }

  async #getSession() {
    const web3modal = await this.#getWeb3Modal();
    const session = await web3modal.getSession();
    return session;
  }

  /**
   * Sends a raw RPC request to the user's wallet.
   */
  request: TypedEip1193Provider["request"] = async (request) => {
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
  };
}

export const DEFAULT_METADATA = {
  name: "Example dApp",
  description: "",
  url: "https://example.com",
  icons: [],
};

export type MyWalletConnectOptions = Omit<
  WalletConnectModalSignOptions,
  "metadata"
> & {
  metadata?: WalletConnectModalSignOptions["metadata"];
};

export type OnRpcConfirmationRequest<
  K extends keyof RpcRequestMap = keyof RpcRequestMap,
> = (request: RpcRequest<K>, controller: AbortController) => unknown;
