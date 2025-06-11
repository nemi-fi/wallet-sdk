import { RemoteArtifactStrategy } from "./artifacts.js";
import type { AztecWalletSdk } from "./base.js";
import {
  type ObsidionBridgeConnectorOptions,
  ObsidionBridgeConnector,
} from "./obsidion.js";

type PartialObsidionPopupConnectorOptions = Partial<
  Pick<
    ObsidionBridgeConnectorOptions,
    "walletUrl" | "artifactStrategy" | "aztecNode"
  >
>;

export function obsidion(params: PartialObsidionPopupConnectorOptions = {}) {
  return (sdk: AztecWalletSdk) =>
    new ObsidionBridgeConnector({
      ...params,
      fallbackOpenPopup: sdk.fallbackOpenPopup,
      walletUrl: params.walletUrl ?? "https://app.obsidion.xyz",
      artifactStrategy:
        params.artifactStrategy ?? RemoteArtifactStrategy.getDefaultSingleton(),

      uuid: "obsidion",
      name: "Obsidion",
      icon: "https://pbs.twimg.com/profile_images/1849068253685116928/MzTzv03r_400x400.jpg",
      aztecNode: sdk.aztecNode(),
    });
}
