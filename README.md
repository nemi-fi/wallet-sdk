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
  connectors: [obsidion({ projectId: "reown-project-id" })],
});
await sdk.connect("obsidion");
const account = await sdk.getAccount();
const token = await Token.at(address, account);
```

## React

```tsx
import { useAccount } from "@shieldswap/wallet-sdk/react";

function App() {
  const account = useAccount(sdk);
  return <div>{account.address.toString()}</div>;
}
```

## Convert aztec.js Wallet to Account

```ts
import { createAztecNodeClient } from "@aztec/aztec.js";
import { type Account, Eip1193Account } from "@shieldswap/wallet-sdk/eip1193";

const [wallet] = await getDeployedTestAccountsWallets(pxe);

const aztecNode = createAztecNodeClient("http://localhost:8080");
const account: Account = Eip1193Account.fromAztec(
  wallet,
  pxe,
  aztecNode,
  paymentMethod,
);
```
