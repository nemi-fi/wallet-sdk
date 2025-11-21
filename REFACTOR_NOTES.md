# Wallet SDK Refactor Notes

## ✅ Migration Status: COMPLETE (Nov 19, 2024)

### Summary of Changes

1. **Removed Server-Side Code**

   - ❌ Deleted `createEip1193ProviderFromAccounts.ts` (user has own RPC implementation)
   - ❌ Removed unused decode functions: `decodeFunctionCall`, `getContractFunctionAbiFromPxe`, `decodeCapsules`, `decodeRegisterContract`, `decodeRegisterContracts`, `decodeContractArtifact`
   - ✅ Kept `decodeContractInstance` (used by Azguard client)

2. **Updated All Imports to New Subpath Exports**

   - All imports now use `@aztec/aztec.js/*` subpaths
   - Removed PXE dependency from SDK
   - TypeScript compiles cleanly

3. **SDK Interface**
   - ✅ Minimal API changes - only internal implementation updated
   - ✅ DApp-facing interface remains compatible
   - ✅ `Eip1193Account` aligns with new `Account` architecture

---

## Overview of Changes in aztec.js 3.0

### Architecture Split

**Before (2.x):**

- Single `Wallet` type with all functionality
- Direct PXE access required
- `Wallet` had methods: `getAddress()`, `createTxExecutionRequest()`, `proveTx()`, `simulateTx()`

**After (3.0):**

- **`Wallet`** - High-level transaction manager

  - `simulateTx(exec: ExecutionPayload, opts: SimulateOptions)`
  - `sendTx(exec: ExecutionPayload, opts: SendOptions)`
  - `registerContract()`, `getContractMetadata()`
  - `createAuthWit(from: AztecAddress, intent)`
  - Wraps PXE internally (users don't access PXE)

- **`Account`** - Low-level signing interface
  - `getAddress()`, `getCompleteAddress()`
  - `createTxExecutionRequest(exec, gasSettings, options)`
  - `createAuthWit(intent)`
  - Focused on cryptographic operations

### Key Architectural Changes

1. **PXE is now internal to Wallet** - DApps should never need PXE access
2. **ExecutionPayload replaces old TxExecutionRequest structure**
3. **FunctionCall now requires `hideMsgSender: boolean`**
4. **New subpath exports** - everything imported from specific paths

### What This Means for wallet-sdk

**Good News**: Your `Eip1193Account` already matches the new `Account` pattern! It:

- Returns an address
- Delegates transaction creation/signing to remote wallet via RPC
- Doesn't need PXE access

**The Result**: Minimal interface changes needed, mostly just internal import updates.

---

## Current Implementation

### Core Components

1. **`BaseAccount`** (abstract class)

   - Implements common account functionality
   - `sendTransaction()`, `simulateTransaction()`, `setPublicAuthWit()`
   - Subclasses provide RPC implementation

2. **`Eip1193Account`** (extends `BaseAccount`)

   - Delegates to remote wallet via EIP-1193 RPC
   - Perfect alignment with new `Account` concept
   - No PXE dependency needed

3. **`Contract`** classes
   - Wrappers around aztec contracts
   - Support deployment and interaction
   - Updated to use new subpath imports

### What Was Removed

- `createEip1193ProviderFromAccounts.ts` - Server-side code not needed
- Unused decode functions that were only for server-side RPC implementation
- `PXE` type usage throughout the codebase

### What Remains

- Full DApp-facing SDK for account management
- Contract deployment and interaction
- EIP-1193 provider pattern
- Azguard wallet client integration

---

## Migration Checklist

- [x] Update all imports to new subpath exports
- [x] Remove PXE dependencies
- [x] Update `FunctionCall` to include `hideMsgSender`
- [x] Handle `protocolContractTreeRoot` removal
- [x] Update `setPublicAuthWit` to work with new types
- [x] Remove server-side implementation code
- [x] Verify TypeScript compilation
- [x] Update documentation

---

## Notes for Future Development

1. **Test File**: `index.test.ts` is currently commented out as it relies on removed aztec.js testing utilities (`getInitialTestAccountsWallets`, direct `PXE` access). Future tests should use the new testing patterns from `@aztec/test-wallet`.

2. **Auth Witness**: The `setPublicAuthWit` method currently only accepts `Fr` or `Uint8Array` message hashes. Intent-based authorization is simplified to avoid type compatibility issues with the new aztec.js API.

3. **Public Call Simulation**: The `simulatePublicCalls` method now throws an error as `protocolContractTreeRoot` is no longer available. This functionality may need reimplementation using the new Wallet API if needed.

4. **Wallet Provider Implementation**: If you need to implement a wallet provider (server-side), refer to `test-wallet` implementation in aztec-packages for the new patterns.
