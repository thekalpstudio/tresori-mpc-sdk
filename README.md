# @kalp_studio/tresori-mpc-sdk

A TypeScript SDK for creating and managing MPC (Multi-Party Computation) wallets with 2-of-3 threshold ECDSA signatures. Sign and execute blockchain transactions without exposing private keys.

## Features

- **MPC Wallet Creation** — Distributed Key Generation (DKG) protocol, no single party holds the full private key
- **Email OTP Authentication** — Create or restore wallets via email verification
- **Token Transfers** — ERC-20 transfers with automatic gas estimation
- **Gasless Transactions** — Meta-transactions via ERC-2771 relay (users pay zero gas)
- **Bulk Transfers** — Send tokens to multiple recipients in a single transaction
- **EIP-712 Signing** — Typed structured data signing for permits, approvals, and more
- **Multi-Chain** — Ethereum, Base, Polygon, Arbitrum, Optimism, BSC, Avalanche (mainnet + testnet)
- **Storage Abstraction** — `localStorage` for browsers, in-memory for Node.js, or bring your own

## Installation

```bash
npm install @kalp_studio/tresori-mpc-sdk
```

**Peer dependency:**

```bash
npm install ethers@^5.7.0
```

## Quick Start

```typescript
import { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

const wallet = new KalpMPCWallet({
  apiKey: 'YOUR_API_KEY',
  chainId: 80002, // Polygon Amoy
});

// Try loading existing wallet from storage
const loaded = await wallet.init();

if (!loaded) {
  // Create via email OTP
  await wallet.sendEmailOtp('user@example.com');
  // User receives 4-digit code...
  const info = await wallet.verifyEmailOtp('user@example.com', '1234');
  console.log('Wallet address:', info.address);
}

// Check balance
const balance = await wallet.getBalance();
console.log('Balance:', balance, 'ETH');
```

## API Reference

### Constructor

```typescript
const wallet = new KalpMPCWallet({
  apiKey: string;          // Required — Kalp Studio API key
  chainId: number;         // Required — Target chain ID
  baseUrl?: string;        // API base URL (default: https://wallet-api.kalp.studio)
  rpcUrl?: string;         // Custom RPC endpoint
  keyStore?: KeyStore;     // Custom storage (default: localStorage in browser)
});
```

### Wallet Lifecycle

```typescript
// Load wallet from storage
await wallet.init(): Promise<boolean>

// Create wallet via email OTP
await wallet.sendEmailOtp(email: string): Promise<SendEmailOtpResult>
await wallet.verifyEmailOtp(email: string, otp: string): Promise<WalletInfo>

// Create wallet directly (requires userId)
await wallet.createWallet(userId: string): Promise<WalletInfo>

// Import existing wallet
await wallet.importWallet(address: string, sessionId: string, clientShare: string): Promise<void>

// Disconnect and clear stored keys
await wallet.disconnect(): Promise<void>
```

### Properties

```typescript
wallet.isInitialized: boolean       // Whether wallet is ready
wallet.address: string | null       // Wallet address (0x...)
wallet.sessionId: string | null     // MPC session ID
wallet.currentChainId: number       // Active chain ID
```

### Sending Transactions

#### Token Transfer (User Pays Gas)

```typescript
const result = await wallet.sendTokenTransfer({
  tokenAddress: '0xTokenAddress',
  to: '0xRecipient',
  amount: '10.5',        // Human-readable amount
  decimals: 18,           // Token decimals (default: 18)
});
console.log('TX Hash:', result.txHash);
```

#### Raw Transaction

```typescript
const result = await wallet.sendTransaction(
  '0xContractAddress',   // to
  '0xCalldata',          // encoded function call
  '0.1'                  // value in ETH (optional)
);
```

#### Contract Call

```typescript
const result = await wallet.callContract({
  contractAddress: '0xContract',
  abi: ['function transfer(address to, uint256 amount) returns (bool)'],
  functionName: 'transfer',
  params: ['0xRecipient', ethers.utils.parseEther('1.0')],
});
```

#### Read Contract (No Gas)

```typescript
const [balance] = await wallet.readContract(
  '0xTokenAddress',
  ['function balanceOf(address) view returns (uint256)'],
  'balanceOf',
  ['0xAddress']
);
```

### Gasless Transactions

Users pay zero gas. Transactions are relayed through Kalp's infrastructure.

```typescript
// Single gasless transfer
const result = await wallet.sendGaslessTransfer({
  tokenAddress: '0xToken',
  to: '0xRecipient',
  amount: '100',
  decimals: 18,
});

// Bulk gasless transfer
const result = await wallet.sendGaslessBulkTransfer({
  tokenAddress: '0xToken',
  recipients: [
    { to: '0xAlice', amount: '50' },
    { to: '0xBob', amount: '25' },
  ],
  decimals: 18,
});
```

### Bulk Transfer (User Pays Gas)

```typescript
const result = await wallet.sendBulkTransfer({
  tokenAddress: '0xToken',
  recipients: [
    { to: '0xAlice', amount: '100' },
    { to: '0xBob', amount: '200' },
  ],
  decimals: 18,
});
```

### Message Signing

```typescript
// Sign a raw message hash
const sig = await wallet.signMessage(messageHash);
// sig = { r, s, v }

// Sign EIP-712 typed data
const signature = await wallet.signTypedData({
  domain: { name: 'MyApp', version: '1', chainId: 80002, verifyingContract: '0x...' },
  types: { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  primaryType: 'Transfer',
  message: { to: '0xRecipient', amount: '1000000000000000000' },
});
```

### Chain Management

```typescript
// Switch to a different chain
wallet.switchChain(8453); // Base Mainnet
wallet.switchChain(1, 'https://my-custom-rpc.com'); // With custom RPC
```

### Utilities

```typescript
const balance = await wallet.getBalance();                          // Native token balance
const tokenBal = await wallet.getTokenBalance('0xToken', 18);      // ERC-20 balance
const nonce = await wallet.getNonce();                              // Transaction count
const facilitator = wallet.getFacilitatorAddress();                 // Facilitator contract
const relayer = wallet.getRelayerAddress();                        // Relayer contract
```

## Supported Chains

| Chain | Mainnet | Testnet |
|-------|---------|---------|
| Ethereum | 1 | 11155111 (Sepolia) |
| Base | 8453 | 84532 (Sepolia) |
| Polygon | 137 | 80002 (Amoy) |
| Arbitrum | 42161 | 421614 (Sepolia) |
| Optimism | 10 | 11155420 (Sepolia) |
| BSC | 56 | 97 (Testnet) |
| Avalanche | 43114 | 43113 (Fuji) |

## Custom Storage

Implement the `KeyStore` interface for custom key storage:

```typescript
import { KalpMPCWallet, KeyStore } from '@kalp_studio/tresori-mpc-sdk';

class MySecureStore implements KeyStore {
  async get(key: string): Promise<string | null> { /* ... */ }
  async set(key: string, value: string): Promise<void> { /* ... */ }
  async remove(key: string): Promise<void> { /* ... */ }
}

const wallet = new KalpMPCWallet({
  apiKey: 'YOUR_KEY',
  chainId: 80002,
  keyStore: new MySecureStore(),
});
```

Built-in options:
- `LocalStorageKeyStore` — Browser localStorage (default in browser)
- `InMemoryKeyStore` — In-memory Map (default in Node.js)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Client App  │────▶│  Kalp MPC SDK │────▶│  Secure TEE   │
│             │     │              │     │  (Share #2)   │
│             │     │  Share #1    │     │              │
└─────────────┘     └──────┬───────┘     └──────┬───────┘
                           │                     │
                           │  Partial Sig #1     │  Partial Sig #2
                           │                     │
                           └────────┬────────────┘
                                    │
                              Combined Signature
                                    │
                              ┌─────▼─────┐
                              │ Blockchain │
                              └───────────┘
```

The private key is **never reconstructed**. Each party computes a partial signature independently, and the SDK combines them into a valid ECDSA signature using Lagrange interpolation.

## License

MIT
