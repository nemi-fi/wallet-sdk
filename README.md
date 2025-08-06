# Aztec Wallet SDK

Connect your Aztec app to any Aztec wallet.

> See [MIGRATION_NOTES.md](./MIGRATION_NOTES.md) for breaking changes.

## EIP-1193 RPC docs

```ts
// before
import { Wallet } from "@aztec/aztec.js";
const account: Wallet;
const token = await TokenContract.at(address, account);

// after
import { AztecWalletSdk, obsidion } from "@nemi-fi/wallet-sdk";
import { Contract } from "@nemi-fi/wallet-sdk/eip1193";

class Token extends Contract.fromAztec(TokenContract) {}

const sdk = new AztecWalletSdk({
  aztecNode: "http://localhost:8080",
  connectors: [obsidion()],
});
await sdk.connect("obsidion");
const account = await sdk.getAccount();
const token = await Token.at(address, account);
```

## React

```tsx
import { useAccount } from "@nemi-fi/wallet-sdk/react";

function App() {
  const account = useAccount(sdk);
  return <div>{account.address.toString()}</div>;
}
```

## Convert aztec.js Wallet to Account

```ts
import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
import { createAztecNodeClient, createPXEClient } from "@aztec/aztec.js";
import { type Account, Eip1193Account } from "@nemi-fi/wallet-sdk/eip1193";

const sandboxUrl = "http://localhost:8080";
const aztecNode = createAztecNodeClient(sandboxUrl);
const pxe = createPXEClient(sandboxUrl);
const [wallet] = await getDeployedTestAccountsWallets(pxe);

const account: Account = await Eip1193Account.fromAztec(wallet, aztecNode, pxe);
```
