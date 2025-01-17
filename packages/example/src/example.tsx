import { useEffect, useState } from "react";
import { Button, Loader, Stack, Text, TextInput } from "@mantine/core";
import { AztecAddress, createPXEClient } from "@aztec/aztec.js";
import {
	TokenContract,
	TokenContractArtifact,
} from "@aztec/noir-contracts.js/Token";
import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
import { Contract } from "@shieldswap/wallet-sdk/eip1193";
import { useWalletContext } from "@shieldswap/wallet-sdk";
import { PXE_URL } from "./App";

export function Example() {
	const pxe = createPXEClient(PXE_URL);
	const { account, sdk } = useWalletContext();

	const [tokenContract, setTokenContract] =
		useState<Contract<TokenContract> | null>(null);
	const [tokenAddress, setTokenAddress] = useState<string | null>(() => {
		return localStorage.getItem("tokenAddress");
	});

	const [privateBalance, setPrivateBalance] = useState<string | null>(null);
	const [publicBalance, setPublicBalance] = useState<string | null>(null);

	const [amount, setAmount] = useState<string | null>(null);
	const [recipient, setRecipient] = useState<string | null>(null);

	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		localStorage.setItem("tokenAddress", tokenAddress || "");
	}, [tokenAddress]);

	const handleFetchBalances = async () => {
		console.log("fetching balances...");
		console.log("account: ", account);
		console.log("tokenContract: ", tokenContract);
		if (!account) return;
		if (!tokenContract) return;

		const privateBalance = await tokenContract.methods
			.balance_of_private(account.getAddress())
			.simulate();
		console.log("privateBalance: ", privateBalance);

		const deployer = (await getDeployedTestAccountsWallets(pxe))[0];
		const token = await TokenContract.at(tokenContract.address, deployer);
		const publicBalance = await token.methods
			.balance_of_public(account.getAddress())
			.simulate();

		setPublicBalance(
			((publicBalance as unknown as bigint) / BigInt(1e18)).toString()
		);
		setPrivateBalance(
			((privateBalance as unknown as bigint) / BigInt(1e18)).toString()
		);
	};

	useEffect(() => {
		handleFetchBalances();
	}, [account, tokenContract]);

	useEffect(() => {
		if (tokenAddress && account) {
			const initTokenContract = async () => {
				const Token = Contract.fromAztec(TokenContract, TokenContractArtifact);
				const tokenContract = await Token.at(
					AztecAddress.fromString(tokenAddress),
					account
				);
				setTokenContract(tokenContract);
			};
			initTokenContract();
		}
	}, [tokenAddress, account]);

	const handleSendTx = async (isPrivate: boolean) => {
		setLoading(true);
		setError(null);
		if (!account) {
			setError("Account not found");
			setLoading(false);
			return;
		}

		if (!tokenContract) {
			setError("Token contract not found");
			setLoading(false);
			return;
		}

		if (!amount) {
			setError("Amount is required");
			setLoading(false);
			return;
		}

		if (!recipient) {
			setError("Recipient is required");
			setLoading(false);
			return;
		}

		console.log("sending token");

		try {
			const txHash = await tokenContract.methods[
				isPrivate ? "transfer_in_private" : "transfer_in_public"
			](
				account.getAddress(),
				AztecAddress.fromString(recipient),
				BigInt(amount) * BigInt(1e18),
				0
			)
				.send()
				.wait();
			console.log("txHash: ", txHash);
		} catch (e) {
			setError("Error sending transaction");
			setLoading(false);
			return;
		}

		setLoading(false);
		handleFetchBalances();
	};

	const handleMintToken = async () => {
		if (!account) {
			setError("Account not found");
			setLoading(false);
			return;
		}

		setLoading(true);

		const deployer = (await getDeployedTestAccountsWallets(pxe))[0];
		const deployTx = await TokenContract.deploy(
			deployer,
			deployer.getAddress(),
			"Token",
			"TEST",
			18n
		)
			.send()
			.wait();
		console.log("deployTx: ", deployTx);

		const tokenContract = deployTx.contract;
		await tokenContract.methods
			.mint_to_private(deployer.getAddress(), deployer.getAddress(), 1000e18)
			.send()
			.wait();
		await tokenContract.methods
			.transfer_in_private(deployer.getAddress(), account.address, 1000e18, 0)
			.send()
			.wait();
		await tokenContract.methods
			.mint_to_public(account.address, 1000e18)
			.send()
			.wait();

		const Token = Contract.fromAztec(TokenContract, TokenContractArtifact);
		const token = await Token.at(tokenContract.address, account);
		setTokenContract(token);
		setTokenAddress(tokenContract.address.toString());
		setLoading(false);
		handleFetchBalances();
	};

	return (
		<Stack align="center" justify="space-between" gap="md" mt={100}>
			<Text mb={30} size="30px">
				Example Token App
			</Text>

			{account ? (
				<>
					<Text size="sm">
						Connected Account: {account.getAddress().toString()}
					</Text>
					{tokenContract && tokenAddress ? (
						<>
							<Text size="sm">Token: {tokenAddress}</Text>
							<div style={{ display: "flex", gap: 10 }}>
								<Text>
									Private Balance:{" "}
									{privateBalance ? `${privateBalance} TEST` : "0 TEST"}
								</Text>
								<Text>
									Public Balance:{" "}
									{publicBalance ? `${publicBalance} TEST` : "0 TEST"}
								</Text>
							</div>

							<TextInput
								style={{ width: "50%" }}
								placeholder="Amount"
								value={amount || ""}
								onChange={(e) => setAmount(e.target.value)}
							/>

							<TextInput
								style={{ width: "50%" }}
								placeholder="Recipient"
								value={recipient || ""}
								onChange={(e) => setRecipient(e.target.value)}
							/>
							<div style={{ display: "flex", gap: 20 }}>
								<Button
									mt={10}
									disabled={loading}
									onClick={() => handleSendTx(true)}
								>
									Send Token (Private)
								</Button>
								<Button
									mt={10}
									disabled={loading}
									onClick={() => handleSendTx(false)}
								>
									Send Token (Public)
								</Button>
							</div>
							{error && <Text color="red">{error}</Text>}
						</>
					) : (
						<>
							<TextInput
								label="Token Address"
								style={{ width: "50%" }}
								placeholder="0x..."
								value={tokenAddress || ""}
								onChange={(e) => {
									setTokenAddress(e.target.value);
									localStorage.setItem("tokenAddress", e.target.value);
								}}
							/>
							<div style={{ display: "flex", gap: 20 }}>
								<Button
									mt={10}
									disabled={loading}
									onClick={() => handleMintToken()}
								>
									Deploy & Mint Token
								</Button>
							</div>
							{error && <Text color="red">{error}</Text>}
						</>
					)}
				</>
			) : (
				<Button onClick={() => sdk?.connect()}>Connect</Button>
			)}
			{loading && <Loader mt={10} size="sm" />}
		</Stack>
	);
}
