import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
import {
  AztecAddress,
  createAztecNodeClient,
  createPXEClient,
  Fr,
  waitForNode,
  type AztecNode,
  type PXE,
  type Wallet,
} from "@aztec/aztec.js";
import { CounterContract } from "@aztec/noir-contracts.js/Counter";
import { beforeAll, describe, expect, test } from "vitest";
import { Contract } from "./contract.js";
import { Eip1193Account } from "./exports/eip1193.js";

class Counter extends Contract.fromAztec(CounterContract) {}

describe("wallet-sdk", () => {
  let pxe: PXE;
  let aztecNode: AztecNode;
  let account: Wallet;
  beforeAll(async () => {
    const url = "http://localhost:8080";
    aztecNode = createAztecNodeClient(url);
    console.log("Waiting for node to be ready");
    await waitForNode(aztecNode);
    console.log("Node is ready");
    pxe = createPXEClient(url);
    account = (await getInitialTestAccountsWallets(pxe))[0]!;
  });

  test("DeployMethod aztec.js parity", async () => {
    const salt = new Fr(0);
    const params = [0, account.getAddress()] as const;
    const deploy = await Counter.deployWithOpts(
      {
        account: Eip1193Account.fromAztec(account, aztecNode, pxe),
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
