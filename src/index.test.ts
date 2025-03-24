import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
import {
  AztecAddress,
  createAztecNodeClient,
  createPXEClient,
  FeeJuicePaymentMethod,
  Fr,
  type AztecNode,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import { CounterContract } from "@aztec/noir-contracts.js/Counter";
import { beforeAll, describe, expect, test } from "vitest";
import { Contract } from "./contract.js";
import { Eip1193Account } from "./exports/eip1193.js";
import { noRetryFetch } from "./utils.js";

class Counter extends Contract.fromAztec(CounterContract) {}

describe("wallet-sdk", () => {
  let pxe: PXE;
  let aztecNode: AztecNode;
  let account: Wallet;
  beforeAll(async () => {
    const url = "http://localhost:8080";
    const f = await noRetryFetch();
    pxe = createPXEClient(url, undefined, f);
    aztecNode = createAztecNodeClient(url, undefined, f);
    account = (await getInitialTestAccountsWallets(pxe))[0]!;
  });

  test("DeployMethod aztec.js parity", async () => {
    const salt = new Fr(0);
    const params = [0, account.getAddress()] as const;
    const deploy = await Counter.deployWithOpts(
      {
        account: Eip1193Account.fromAztec(
          account,
          aztecNode,
          pxe,
          new FeeJuicePaymentMethod(account.getAddress()),
        ),
        contractAddressSalt: salt,
      },
      ...params,
    ).request();
    const deployAztec = await CounterContract.deploy(
      account,
      ...params,
    ).request({ contractAddressSalt: salt });

    // patch the addresses. There is a flaky .asBigInt field
    for (const call of deploy.calls) {
      call.to = AztecAddress.fromString(call.to.toString());
    }
    for (const call of deployAztec.calls) {
      call.to = AztecAddress.fromString(call.to.toString());
    }

    expect(deployAztec.calls).to.deep.eq(deploy.calls);
  });
});
