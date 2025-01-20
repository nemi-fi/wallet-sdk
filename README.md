# Aztec Wallet SDK

Connect your Aztec app to any Aztec wallet.

[Docs](https://docs.shieldswap.org/modal)

### ReOwnPopupWalletSdk

```ts
const pxe = createPXEClient(PXE_URL);
const params = {
	walletUrl: "http://localhost:5173",
	fallbackOpenPopup: fallbackOpenPopup,
};
const wcOptions = {
	projectId: "",
};
const wallet = new ReOwnPopupWalletSdk(pxe, wcOptions, params);
const account = await wallet.connect();
const token = await Token.at(address, account);
```
