import type { AztecWalletSdk } from "./base.js";
import {
  ReownPopupAdapter,
  type ReownPopupAdapterOptions,
} from "./reownPopup.js";

type PartialReownPopupAdapterOptions = Pick<
  ReownPopupAdapterOptions,
  "projectId" | "metadata"
> &
  Partial<Pick<ReownPopupAdapterOptions, "walletUrl">>;

export function obsidion(params: PartialReownPopupAdapterOptions) {
  return (sdk: AztecWalletSdk) =>
    new ReownPopupAdapter({
      ...params,
      fallbackOpenPopup: sdk.fallbackOpenPopup,
      walletUrl: params.walletUrl ?? "https://app.obsidion.xyz",

      uuid: "obsidion",
      name: "Obsidion",
      icon: "https://pbs.twimg.com/profile_images/1849068253685116928/MzTzv03r_400x400.jpg",
    });
}
