# Tresori MPC SDK — Developer Integration Guide

> **Audience:** Frontend/backend developers integrating wallet login and KYC compliance into a web application.
> No blockchain experience required. This guide walks through every step.

**Live Demo:** https://tresori-mpc-demo-production.up.railway.app
**npm:** `npm i @kalp_studio/tresori-mpc-sdk`

---

## Table of Contents

1. [What You're Building](#1-what-youre-building)
2. [Prerequisites](#2-prerequisites)
3. [Installation & Setup](#3-installation--setup)
4. [Step 1 — Initialize the SDK](#4-step-1--initialize-the-sdk)
5. [Step 2 — Wallet Login with Email OTP](#5-step-2--wallet-login-with-email-otp)
6. [Step 3 — Create a Decentralized Identity (DID)](#6-step-3--create-a-decentralized-identity-did)
7. [Step 4 — Admin KYC Approval (Issue Credentials)](#7-step-4--admin-kyc-approval-issue-credentials)
8. [Step 5 — Verify KYC Status](#8-step-5--verify-kyc-status)
9. [Complete Working Example](#9-complete-working-example)
10. [Contract Addresses & ABIs](#10-contract-addresses--abis)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What You're Building

```
┌──────────────┐    OTP     ┌───────────────┐   DKG    ┌─────────────┐
│   User Email  │──────────▶│  Kalp Server   │────────▶│  MPC Wallet  │
└──────────────┘            └───────────────┘          └──────┬──────┘
                                                              │
                     ┌────────────────────────────────────────┘
                     │
              ┌──────▼──────┐  on-chain   ┌──────────────────┐
              │  Create DID  │───────────▶│  IdentityRegistry │
              └──────┬──────┘            └──────────────────┘
                     │
              ┌──────▼──────┐  on-chain   ┌────────────────────┐
              │  KYC Approve │───────────▶│ CredentialRegistry  │
              └──────┬──────┘            └────────────────────┘
                     │
              ┌──────▼──────┐  on-chain   ┌──────────┐
              │  RWA Transfer│───────────▶│ RWAToken  │
              └─────────────┘            └──────────┘
                                          calls Facade.verify()
                                          before every transfer
```

**In plain English:**

1. User logs in with email + OTP — a blockchain wallet is created behind the scenes (no seed phrases, no MetaMask)
2. A Decentralized Identity (DID) is created on-chain for the user
3. An admin (KYC issuer) approves the user's KYC — this writes a credential on-chain
4. The user can now transact with compliance-gated tokens (RWA tokens check KYC before every transfer)

---

## 2. Prerequisites

| What | Why |
|------|-----|
| **Node.js 18+** | Runtime |
| **API Key** | Get from [Kalp Studio](https://studio.kalp.technology) |
| **KYC Issuer Private Key** | For admin credential issuance (Step 4). The issuer must be registered in the IssuerRegistry contract. |
| **MATIC (Polygon Amoy)** | Testnet gas tokens. Get free from [Polygon Faucet](https://faucet.polygon.technology/) |

---

## 3. Installation & Setup

```bash
npm install @kalp_studio/tresori-mpc-sdk ethers@^5.7.0
```

That's it. The SDK has one peer dependency (`ethers v5`). No native modules, no polyfills.

**TypeScript support** is built in — full `.d.ts` types included.

---

## 4. Step 1 — Initialize the SDK

```typescript
import { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

const wallet = new KalpMPCWallet({
  apiKey: 'YOUR_KALP_API_KEY',   // Required
  chainId: 80002,                 // Polygon Amoy (testnet)
  // baseUrl: 'https://wallet-api.kalp.studio',  // default, no need to set
  // rpcUrl: 'https://custom-rpc.com',           // optional override
});
```

### Try to restore an existing session

The SDK stores wallet keys in `localStorage`. On page reload, call `init()` to check if a wallet already exists:

```typescript
const hasWallet = await wallet.init();

if (hasWallet) {
  console.log('Wallet restored:', wallet.address);
  // Skip to Step 3 or 4
} else {
  console.log('No wallet found, show login screen');
  // Go to Step 2
}
```

### Key properties (available after login or init)

```typescript
wallet.address        // "0xa281..." — the user's wallet address
wallet.sessionId      // MPC session identifier
wallet.currentChainId // 80002
wallet.isInitialized  // true/false
```

---

## 5. Step 2 — Wallet Login with Email OTP

No MetaMask. No seed phrases. The user just enters their email.

### 5.1 Send OTP

```typescript
const result = await wallet.sendEmailOtp('user@example.com');

console.log(result.isNewWallet);  // true = first time, false = returning user
console.log(result.message);      // "OTP sent"
```

The user will receive a **4-digit code** at their email address.

### 5.2 Verify OTP

```typescript
const walletInfo = await wallet.verifyEmailOtp('user@example.com', '1234');

console.log(walletInfo.address);   // "0xa281..."
console.log(walletInfo.sessionId); // "31c307ea-..."
```

**What happens behind the scenes:**

| Scenario | What the SDK does |
|----------|-------------------|
| **New user** | Runs Distributed Key Generation (DKG) — creates a new MPC wallet. Takes ~3 seconds. |
| **Returning user** | Server returns existing wallet address + reshared key material. Instant. |

The wallet is now ready. `wallet.isInitialized` is `true`.

### 5.3 Disconnect

```typescript
await wallet.disconnect();
// Clears all keys from localStorage
// User must re-login with OTP to use the wallet again
```

### Full React example

```tsx
function LoginScreen({ wallet, onLogin }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'otp'

  const sendOtp = async () => {
    await wallet.sendEmailOtp(email);
    setStep('otp');
  };

  const verifyOtp = async () => {
    const info = await wallet.verifyEmailOtp(email, otp);
    console.log('Logged in:', info.address);
    onLogin();
  };

  if (step === 'email') {
    return (
      <div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <button onClick={sendOtp}>Send OTP</button>
      </div>
    );
  }

  return (
    <div>
      <p>Enter the 4-digit code sent to {email}</p>
      <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={4} />
      <button onClick={verifyOtp}>Verify</button>
    </div>
  );
}
```

---

## 6. Step 3 — Create a Decentralized Identity (DID)

> **What is a DID?** A unique on-chain identifier for the user. Think of it as a blockchain passport. It is required before any KYC credential can be issued.

### 6.1 Setup: Contract addresses and ABIs

```typescript
import { ethers } from 'ethers';

// Polygon Amoy testnet contracts
const CONTRACTS = {
  IdentityRegistry: '0xA32E0b7e85C368c18D7DA03736e52fbafc9CB32B',
  CredentialRegistry: '0x14c52AbeCB82E33Bcf9570bD83701979a792b730',
  IssuerRegistry: '0xa70B3DF81Bc7Dc57a4feF51108EB9BD0139cC4c7',
  Facade: '0x46C1F446c6183aBD67493aB15AD308D1b2e493c4',
};

const IDENTITY_REGISTRY_ABI = [
  'function createIdentity(bytes32 metadataURI) external returns (bytes32)',
  'function resolveDID(address wallet) external view returns (bytes32)',
  'function getIdentity(bytes32 did) external view returns (tuple(bytes32 did, address owner, address[] controllers, bytes32 metadataURI, uint8 status, uint256 createdAt, uint256 updatedAt))',
  'function addController(bytes32 did, address controller) external',
  'function removeController(bytes32 did, address controller) external',
];
```

### 6.2 Check if user already has a DID

```typescript
const didResult = await wallet.readContract(
  CONTRACTS.IdentityRegistry,
  IDENTITY_REGISTRY_ABI,
  'resolveDID',
  [wallet.address]
);

const did = didResult[0] ?? didResult;
const zeroDID = '0x' + '0'.repeat(64);

if (did !== zeroDID) {
  console.log('User already has a DID:', did);
  // Skip to Step 4
} else {
  console.log('No DID found, create one');
}
```

### 6.3 Create metadata hash

The `createIdentity` function takes a `bytes32` metadata hash. You can hash any metadata you want — a JSON document, an IPFS CID, etc.

```typescript
// Option A: Hash a JSON metadata document
const metadata = {
  displayName: 'John Smith',
  organization: 'Acme Corp',
  entityType: 'individual',       // "individual" or "organization"
  jurisdiction: 'United States',
};
const metadataHash = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(JSON.stringify(metadata))
);

// Option B: Hash an IPFS CID (if you pinned to IPFS)
// const metadataHash = ethers.utils.keccak256(
//   ethers.utils.toUtf8Bytes('QmXoypiz...')
// );
```

### 6.4 Create the DID on-chain

```typescript
const tx = await wallet.callContract({
  contractAddress: CONTRACTS.IdentityRegistry,
  abi: IDENTITY_REGISTRY_ABI,
  functionName: 'createIdentity',
  params: [metadataHash],
});

console.log('DID created! TX hash:', tx.txHash);
```

**Gas cost:** ~150,000 gas (~0.003 MATIC on Amoy)

### 6.5 Read back the DID

After the transaction confirms, read the DID:

```typescript
const didResult = await wallet.readContract(
  CONTRACTS.IdentityRegistry,
  IDENTITY_REGISTRY_ABI,
  'resolveDID',
  [wallet.address]
);

const myDID = didResult[0] ?? didResult;
console.log('My DID:', myDID);
// "0x7a3f..." (bytes32 hex string)
```

### 6.6 Get full identity details

```typescript
const identity = await wallet.readContract(
  CONTRACTS.IdentityRegistry,
  IDENTITY_REGISTRY_ABI,
  'getIdentity',
  [myDID]
);

console.log('Owner:', identity.owner);
console.log('Status:', identity.status);       // 0 = Active, 1 = Suspended, 2 = Revoked
console.log('Controllers:', identity.controllers);
console.log('Created:', new Date(identity.createdAt * 1000));
```

---

## 7. Step 4 — Admin KYC Approval (Issue Credentials)

> **Who does this?** A trusted KYC issuer (admin). This is NOT done by the end user. The issuer's address must be registered in the `IssuerRegistry` contract.

### 7.1 Credential types

There are 4 credential types. Each is a `keccak256` hash:

```typescript
const CRED_KYC_AML      = ethers.utils.id('KYC_AML');        // Basic KYC + Anti-Money Laundering
const CRED_ACCREDITED    = ethers.utils.id('ACCREDITED_INV'); // Accredited Investor (SEC Reg D)
const CRED_SANCTIONS     = ethers.utils.id('SANCTIONS_CLEAR');// Sanctions list clearance
const CRED_RWA_HOLDER    = ethers.utils.id('RWA_HOLDER');     // Authorized RWA token holder
```

For most use cases, you only need **KYC_AML**.

### 7.2 The issuer flow

The issuer needs to:
1. Resolve the user's DID from their wallet address
2. Create a data hash
3. Sign the credential with EIP-712
4. Submit the credential on-chain

### 7.3 Full issuer code

```typescript
import { ethers } from 'ethers';

// ── Issuer setup ──
// The issuer has a regular Ethereum private key (NOT an MPC wallet)
const ISSUER_PRIVATE_KEY = '0x...'; // Keep this secret!
const provider = new ethers.providers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
const issuerWallet = new ethers.Wallet(ISSUER_PRIVATE_KEY, provider);

const CONTRACTS = {
  IdentityRegistry: '0xA32E0b7e85C368c18D7DA03736e52fbafc9CB32B',
  CredentialRegistry: '0x14c52AbeCB82E33Bcf9570bD83701979a792b730',
};

const IDENTITY_REGISTRY_ABI = [
  'function resolveDID(address wallet) external view returns (bytes32)',
];

const CREDENTIAL_REGISTRY_ABI = [
  'function issue(bytes32 did, bytes32 credType, bytes32 dataHash, uint256 expiresAt, bytes signature) external',
];

// ── Issue a KYC credential ──
async function approveKYC(userAddress: string) {

  // 1. Resolve user's DID
  const identityRegistry = new ethers.Contract(
    CONTRACTS.IdentityRegistry,
    IDENTITY_REGISTRY_ABI,
    provider
  );
  const userDID = await identityRegistry.resolveDID(userAddress);

  if (userDID === ethers.constants.HashZero) {
    throw new Error('User has no DID. They must create one first (Step 3).');
  }

  // 2. Set credential parameters
  const credType = ethers.utils.id('KYC_AML');
  const expiresAt = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year

  // 3. Create data hash (encode the credential payload)
  const dataHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'bytes32', 'uint256'],
      [userAddress, credType, expiresAt]
    )
  );

  // 4. Sign with EIP-712
  const domain = {
    name: 'OnChainIdentity',
    version: '1',
    chainId: 80002,
    verifyingContract: CONTRACTS.CredentialRegistry,
  };

  const types = {
    Credential: [
      { name: 'did', type: 'bytes32' },
      { name: 'credType', type: 'bytes32' },
      { name: 'dataHash', type: 'bytes32' },
      { name: 'expiresAt', type: 'uint256' },
    ],
  };

  const value = {
    did: userDID,
    credType: credType,
    dataHash: dataHash,
    expiresAt: expiresAt,
  };

  const signature = await issuerWallet._signTypedData(domain, types, value);

  // 5. Submit on-chain
  const credRegistry = new ethers.Contract(
    CONTRACTS.CredentialRegistry,
    CREDENTIAL_REGISTRY_ABI,
    issuerWallet
  );

  const tx = await credRegistry.issue(
    userDID,
    credType,
    dataHash,
    expiresAt,
    signature,
    {
      gasLimit: 300000,
      maxPriorityFeePerGas: ethers.utils.parseUnits('25', 'gwei'),
      maxFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
    }
  );

  const receipt = await tx.wait();
  console.log('KYC approved! TX:', receipt.transactionHash);
}

// Usage:
await approveKYC('0xa2811cbA3f5955f18Be6C2753e7D2F9Ef266E5D8');
```

### 7.4 Batch approvals

To approve multiple users, just loop:

```typescript
const usersToApprove = [
  '0xAlice...',
  '0xBob...',
  '0xCharlie...',
];

for (const addr of usersToApprove) {
  await approveKYC(addr);
  console.log(`Approved: ${addr}`);
}
```

### 7.5 Issue other credential types

Same code, just change `credType`:

```typescript
// Accredited Investor
await issueCredential(userAddress, ethers.utils.id('ACCREDITED_INV'));

// Sanctions Clearance
await issueCredential(userAddress, ethers.utils.id('SANCTIONS_CLEAR'));

// RWA Holder
await issueCredential(userAddress, ethers.utils.id('RWA_HOLDER'));
```

---

## 8. Step 5 — Verify KYC Status

Anyone can check if an address has valid KYC. This is a **read-only** call (no gas needed).

### 8.1 Quick check: is this address KYC-verified?

```typescript
const FACADE_ABI = [
  'function verify(address subject, bytes32 credType) external view returns (bool)',
];

const isKYCVerified = await wallet.readContract(
  CONTRACTS.Facade,
  FACADE_ABI,
  'verify',
  [addressToCheck, ethers.utils.id('KYC_AML')]
);

console.log('KYC verified:', isKYCVerified);
// true = has valid, non-expired KYC credential
// false = no credential, or expired, or revoked
```

### 8.2 Get credential details

```typescript
const FACADE_ABI_FULL = [
  'function verify(address subject, bytes32 credType) external view returns (bool)',
  'function getCredential(address subject, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
];

const credential = await wallet.readContract(
  CONTRACTS.Facade,
  FACADE_ABI_FULL,
  'getCredential',
  [addressToCheck, ethers.utils.id('KYC_AML')]
);

console.log('Issuer:', credential.issuer);
console.log('Issued:', new Date(credential.issuedAt * 1000));
console.log('Expires:', new Date(credential.expiresAt * 1000));
console.log('Revoked:', credential.revoked);
```

### 8.3 Check all credential types at once

```typescript
const CRED_TYPES = [
  { label: 'KYC / AML',           hash: ethers.utils.id('KYC_AML') },
  { label: 'Accredited Investor',  hash: ethers.utils.id('ACCREDITED_INV') },
  { label: 'Sanctions Clear',      hash: ethers.utils.id('SANCTIONS_CLEAR') },
  { label: 'RWA Holder',           hash: ethers.utils.id('RWA_HOLDER') },
];

const results = await Promise.all(
  CRED_TYPES.map(async (cred) => {
    const verified = await wallet.readContract(
      CONTRACTS.Facade,
      FACADE_ABI,
      'verify',
      [addressToCheck, cred.hash]
    );
    return { type: cred.label, verified };
  })
);

console.table(results);
// ┌──────────────────────┬──────────┐
// │ type                 │ verified │
// ├──────────────────────┼──────────┤
// │ KYC / AML            │ true     │
// │ Accredited Investor  │ false    │
// │ Sanctions Clear      │ true     │
// │ RWA Holder           │ false    │
// └──────────────────────┴──────────┘
```

---

## 9. Complete Working Example

End-to-end: from zero to KYC-verified wallet.

```typescript
import { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';
import { ethers } from 'ethers';

// ── Config ──
const API_KEY = 'YOUR_API_KEY';
const CHAIN_ID = 80002; // Polygon Amoy

const CONTRACTS = {
  IdentityRegistry: '0xA32E0b7e85C368c18D7DA03736e52fbafc9CB32B',
  CredentialRegistry: '0x14c52AbeCB82E33Bcf9570bD83701979a792b730',
  Facade: '0x46C1F446c6183aBD67493aB15AD308D1b2e493c4',
};

const IDENTITY_ABI = [
  'function createIdentity(bytes32 metadataURI) external returns (bytes32)',
  'function resolveDID(address wallet) external view returns (bytes32)',
];

const FACADE_ABI = [
  'function verify(address subject, bytes32 credType) external view returns (bool)',
];

// ══════════════════════════════════════
// STEP 1: Initialize SDK
// ══════════════════════════════════════
const wallet = new KalpMPCWallet({ apiKey: API_KEY, chainId: CHAIN_ID });

// Try restore existing session
const restored = await wallet.init();

// ══════════════════════════════════════
// STEP 2: Login with email OTP
// ══════════════════════════════════════
if (!restored) {
  await wallet.sendEmailOtp('user@example.com');
  // ... user enters the 4-digit code from their email ...
  const info = await wallet.verifyEmailOtp('user@example.com', '1234');
  console.log('Wallet address:', info.address);
}

// ══════════════════════════════════════
// STEP 3: Create DID (if needed)
// ══════════════════════════════════════
let did = await wallet.readContract(
  CONTRACTS.IdentityRegistry, IDENTITY_ABI, 'resolveDID', [wallet.address]
);
did = did[0] ?? did;

if (did === ethers.constants.HashZero) {
  const metadata = { displayName: 'John Smith', entityType: 'individual' };
  const hash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(JSON.stringify(metadata))
  );
  const tx = await wallet.callContract({
    contractAddress: CONTRACTS.IdentityRegistry,
    abi: IDENTITY_ABI,
    functionName: 'createIdentity',
    params: [hash],
  });
  console.log('DID created:', tx.txHash);

  // Re-read the DID
  did = await wallet.readContract(
    CONTRACTS.IdentityRegistry, IDENTITY_ABI, 'resolveDID', [wallet.address]
  );
  did = did[0] ?? did;
}

console.log('DID:', did);

// ══════════════════════════════════════
// STEP 4: Admin approves KYC (server-side)
// ══════════════════════════════════════
// See Section 7 — this is done by the issuer, not the user.
// The user submits their address, the admin runs approveKYC(address).

// ══════════════════════════════════════
// STEP 5: Check KYC status
// ══════════════════════════════════════
const isVerified = await wallet.readContract(
  CONTRACTS.Facade, FACADE_ABI, 'verify',
  [wallet.address, ethers.utils.id('KYC_AML')]
);
console.log('KYC verified:', isVerified);
```

---

## 10. Contract Addresses & ABIs

### Polygon Amoy (Testnet — Chain ID: 80002)

| Contract | Address |
|----------|---------|
| Facade | `0x46C1F446c6183aBD67493aB15AD308D1b2e493c4` |
| IdentityRegistry | `0xA32E0b7e85C368c18D7DA03736e52fbafc9CB32B` |
| CredentialRegistry | `0x14c52AbeCB82E33Bcf9570bD83701979a792b730` |
| IssuerRegistry | `0xa70B3DF81Bc7Dc57a4feF51108EB9BD0139cC4c7` |
| DelegationManager | `0xF17801889f697765ebf68Dfd1488B9D8adec6a33` |
| ZKVerifier | `0xF59dB5e7b713d44f63B8ae32D3228e075D8e2b03` |

### Polygon Mainnet (Chain ID: 137)

| Contract | Address |
|----------|---------|
| Facade | `0x85539fC1577676a64A2022F0a778A2d38a447CAa` |
| IdentityRegistry | `0x5B09Bf3a7Fec10BDE820CbFC76a14cFCe17ABe75` |
| CredentialRegistry | `0xF1aBD88910494a30527E1184081979D693bB3aAF` |
| IssuerRegistry | `0x6358A9b5c27d301CbC92db3c100D1b110F336F8e` |
| DelegationManager | `0x937C39f2a00250Df91BE0d69e997c712C9b605d1` |
| ZKVerifier | `0x15A771E553aD4A2011317904951C5F1BcfC0Ce43` |

### Full ABI Fragments

```typescript
// ── IdentityRegistry ──
const IDENTITY_REGISTRY_ABI = [
  'function createIdentity(bytes32 metadataURI) external returns (bytes32)',
  'function resolveDID(address wallet) external view returns (bytes32)',
  'function getIdentity(bytes32 did) external view returns (tuple(bytes32 did, address owner, address[] controllers, bytes32 metadataURI, uint8 status, uint256 createdAt, uint256 updatedAt))',
  'function isActiveDID(bytes32 did) external view returns (bool)',
  'function updateMetadata(bytes32 did, bytes32 metadataURI) external',
  'function addController(bytes32 did, address controller) external',
  'function removeController(bytes32 did, address controller) external',
];

// ── CredentialRegistry ──
const CREDENTIAL_REGISTRY_ABI = [
  'function issue(bytes32 did, bytes32 credType, bytes32 dataHash, uint256 expiresAt, bytes signature) external',
  'function verify(address subject, bytes32 credType) external view returns (bool)',
  'function getCredential(address subject, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function getCredentialByDID(bytes32 did, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
];

// ── IssuerRegistry ──
const ISSUER_REGISTRY_ABI = [
  'function isTrustedIssuer(address issuer, bytes32 credType) external view returns (bool)',
  'function getIssuer(address issuer) external view returns (tuple(address issuerAddress, uint8 tier, bytes32[] allowedCredTypes, uint256 addedAt, bool active))',
];

// ── Facade (unified read interface) ──
const FACADE_ABI = [
  'function verify(address subject, bytes32 credType) external view returns (bool)',
  'function getCredential(address subject, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function resolveDID(address wallet) external view returns (bytes32)',
];

// ── DelegationManager ──
const DELEGATION_MANAGER_ABI = [
  'function createAgentDID(bytes32 principalDID, address agentAddress) external returns (bytes32)',
  'function grantPermission(bytes32 principalDID, address agentAddress, bytes32 permission, uint256 expiresAt) external',
  'function revokePermission(bytes32 principalDID, address agentAddress, bytes32 permission) external',
  'function isControllerView(bytes32 principalDID, address agentAddress, bytes32 permission) external view returns (bool)',
  'function getDelegation(address agentAddress, bytes32 principalDID, bytes32 permission) external view returns (tuple(bytes32 principalDID, address agentAddress, bytes32[] permissions, uint256 expiresAt, bool revoked))',
];
```

### Credential Type Hashes

```typescript
ethers.utils.id('KYC_AML')         // 0x4b59435f...
ethers.utils.id('ACCREDITED_INV')   // 0x4143435245...
ethers.utils.id('SANCTIONS_CLEAR')  // 0x53414e43...
ethers.utils.id('RWA_HOLDER')       // 0x5257415f...
```

---

## 11. Troubleshooting

### "Wallet not initialized"

**Cause:** Trying to call `signMessage`, `callContract`, etc. before the wallet is ready.

**Fix:** Make sure either `wallet.init()` returned `true`, or `wallet.verifyEmailOtp()` completed successfully. Check `wallet.isInitialized` before making calls.

### "DKG init failed"

**Cause:** Invalid API key or network issue.

**Fix:** Double-check your `apiKey`. Make sure `chainId` matches a supported chain (80002 for Amoy testnet).

### "Transaction reverted"

**Cause:** Not enough gas, or the contract call failed validation.

**Fix:**
- Make sure the wallet has MATIC for gas. Get testnet MATIC from [Polygon Faucet](https://faucet.polygon.technology/).
- For `createIdentity`: the address might already have a DID. Check with `resolveDID` first.
- For `issue`: the issuer might not be registered. Check with `isTrustedIssuer`.

### "OTP verification failed"

**Cause:** Wrong OTP code, expired code (>5 min), or email mismatch.

**Fix:** Request a new OTP with `sendEmailOtp()`. Make sure the email matches exactly.

### "Credential verify returns false"

**Cause:** The credential doesn't exist, is expired, or is revoked.

**Fix:** Use `getCredential()` to see details. Check `expiresAt` and `revoked` fields.

---

## Quick Reference

| Task | Method |
|------|--------|
| Initialize SDK | `new KalpMPCWallet({ apiKey, chainId })` |
| Restore session | `wallet.init()` |
| Send OTP | `wallet.sendEmailOtp(email)` |
| Verify OTP | `wallet.verifyEmailOtp(email, code)` |
| Disconnect | `wallet.disconnect()` |
| Read contract | `wallet.readContract(addr, abi, fn, params)` |
| Write contract | `wallet.callContract({ contractAddress, abi, functionName, params })` |
| Sign message | `wallet.signMessage(hash)` |
| Check balance | `wallet.getBalance()` |
| Get address | `wallet.address` |
