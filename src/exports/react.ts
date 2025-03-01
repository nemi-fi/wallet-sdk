import { useEffect, useState } from "react";
import type { PopupWalletSdk } from "../popup.js";
import type { Account } from "../types.js";

export function useAccount(wallet: Pick<PopupWalletSdk, "accountObservable">) {
  const [account, setAccount] = useState<Account | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = wallet.accountObservable.subscribe((account) => {
      setAccount(account);
    });
    return () => unsubscribe();
  }, []);

  return account;
}
