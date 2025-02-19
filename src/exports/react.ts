import { useEffect, useState } from "react";
import type { PopupWalletSdk } from "../popup.js";
import type { Eip1193Account } from "./eip1193.js";

export function useAccount(wallet: Pick<PopupWalletSdk, "accountObservable">) {
  const [account, setAccount] = useState<Eip1193Account | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = wallet.accountObservable.subscribe((account) => {
      setAccount(account);
    });
    return () => unsubscribe();
  }, []);

  return account;
}
