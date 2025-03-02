# Aztec Wallet SDK

Connect your Aztec app to any Aztec wallet.

## EIP-1193 RPC docs

```ts
// before
import { Wallet } from "@aztec/aztec.js";
const account: Wallet;
const token = await TokenContract.at(address, account);

// after
import { AztecWalletSdk, obsidion } from "@shieldswap/wallet-sdk";
import { Contract } from "@shieldswap/wallet-sdk/eip1193";

class Token extends Contract.fromAztec(TokenContract) {}

const sdk = new AztecWalletSdk({
  aztecNode: "http://localhost:8080",
  adapters: [obsidion({ projectId: "reown-project-id" })],
});
await sdk.connect("obsidion");
const account = await sdk.getAccount();
const token = await Token.at(address, account);
```
