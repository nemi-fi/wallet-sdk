export type SerializedFunctionCall = {
  /** `AztecAddress` of the contract */
  to: string;
  // TODO: replace selector and args with encoded `data` similar to Ethereum?
  /** `FunctionSelector` of the contract method */
  selector: string;
  /** `Fr[]` */
  args: string[];
};

export type RpcRequestMap = {
  /**
   * Requests the user to connect 1 or more accounts to the app. Should trigger a confirmation popup/modal.
   * @returns `AztecAddress[]` of the connected accounts. The first one must be the currently selected account.
   */
  aztec_requestAccounts: () => string[];

  /**
   * Must **NOT** trigger a confirmation popup/modal.
   * @returns `AztecAddress[]` of the previously connected accounts. The first one must be the currently selected account.
   */
  aztec_accounts: () => string[];

  /**
   * Sends a transaction to the blockchain from `request.from` account.
   * @returns the transaction hash
   */
  aztec_sendTransaction: (request: {
    /** `AztecAddress` of the account that will send the transaction */
    from: string;
    /** `FunctionCall[]` to be executed in the transaction */
    calls: SerializedFunctionCall[];
    /** Authentication witnesses required for the transaction */
    authWitnesses: {
      /** `AztecAddress` */
      caller: string;
      /** `FunctionCall` */
      // TODO: rename to `call`?
      action: SerializedFunctionCall;
    }[];
  }) => string;

  // TODO: add aztec_estimateGas

  /**
   * Reads blockchain state.
   * @returns an array of return values (each being `Fr[]`) of the calls
   */
  aztec_call: (request: {
    /** `AztecAddress` of the account that will the call will be simulated from */
    from: string;
    /** `FunctionCall[]` to be simulated */
    calls: SerializedFunctionCall[];
  }) => string[][];

  /**
   * Requests the user to add an asset to the wallet. Must trigger a confirmation popup.
   * @returns `true` if user approved the request, `false` otherwise
   */
  wallet_watchAsset: (request: {
    // TODO: is this type namespaced enough? Could this clash with other chains which names start with "A"? E.g., Aleo also has an "ARC20" standard
    type: "ARC20";
    options: {
      // TODO: add chainId
      address: string;
      symbol: string;
      decimals: number;
      image: string;
    };
  }) => boolean;
};

export type RpcRequest<M extends keyof RpcRequestMap> = {
  method: M;
  params: Parameters<RpcRequestMap[M]>;
};

export type RpcEventsMap = {
  /**
   * Emitted when the user changes the selected account in wallet UI. It is the `AztecAddress` of the new selected account.
   */
  accountsChanged: [string];
};

export interface Eip1193Provider {
  request(request: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
}

export interface TypedEip1193Provider {
  request<M extends keyof RpcRequestMap>(
    request: RpcRequest<M>,
  ): Promise<ReturnType<RpcRequestMap[M]>>;
}
