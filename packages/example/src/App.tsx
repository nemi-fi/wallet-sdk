import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { AppShell, MantineProvider } from "@mantine/core";
import { Example } from "./example";
import { WalletProvider } from "@shieldswap/wallet-sdk";

export const PXE_URL = "http://localhost:8080";
export const WALLET_URL = "http://localhost:5173";

const App = () => {
	return (
		<>
			<MantineProvider>
				<WalletProvider pxeUrl={PXE_URL} walletUrl={WALLET_URL}>
					<AppShell>
						<AppShell.Main>
							<Example />
						</AppShell.Main>
					</AppShell>
				</WalletProvider>
			</MantineProvider>
		</>
	);
};

export default App;
