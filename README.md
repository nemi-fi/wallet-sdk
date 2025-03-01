# Aztec Wallet SDK

Connect your Aztec app to any Aztec wallet.

[Docs](https://docs.shieldswap.org/modal)

## EIP-1193 RPC docs

```ts
// before
import { Wallet } from "@aztec/aztec.js";
const account: Wallet;
const token = await TokenContract.at(address, account);

// after
import { PopupWalletSdk } from "@shieldswap/wallet-sdk";
import { Eip1193Account, Contract } from "@shieldswap/wallet-sdk/eip1193";

class Token extends Contract.fromAztec(TokenContract, TokenContractArtifact) {}

const wallet = new PopupWalletSdk(pxe);
const account = await wallet.getAccount();
const token = await Token.at(address, account);
```
