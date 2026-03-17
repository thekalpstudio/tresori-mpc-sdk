// ─── Storage ────────────────────────────────────────────────────────────────

export interface KeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ─── SDK Configuration ──────────────────────────────────────────────────────

export interface KalpMPCConfig {
  apiKey: string;
  baseUrl?: string;
  chainId: number;
  rpcUrl?: string;
  keyStore?: KeyStore;
}

// ─── DKG (Wallet Creation) ──────────────────────────────────────────────────

export interface DKGInitResponse {
  sessionId: string;
  serverShare1Contribution: string;
  serverShare2Contribution: string;
  enclaveEncryptedShare: string;
  enclaveIv: string;
  enclaveAuthTag: string;
  enclaveEcdhPublicKey: string;
  address: string;
}

export interface DKGContributeResponse {
  success: boolean;
  address: string;
}

export interface WalletInfo {
  address: string;
  sessionId: string;
  chainId: number;
}

// ─── MPC Signing ────────────────────────────────────────────────────────────

export interface MPCSignRequest {
  messageHash: string;
  sharedNonceK: string;
  r: string;
  sessionId: string;
}

export interface MPCSignResponse {
  partialSignature: string;
}

export interface ECDSASignature {
  r: string;
  s: string;
  v: number;
}

// ─── Transaction ────────────────────────────────────────────────────────────

export interface TransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface TransactionResult {
  txHash: string;
}

export interface TokenTransferParams {
  tokenAddress: string;
  to: string;
  amount: string;
  decimals?: number;
}

export interface BulkTransferRecipient {
  to: string;
  amount: string;
}

export interface BulkTransferParams {
  tokenAddress: string;
  recipients: BulkTransferRecipient[];
  decimals?: number;
}

// ─── Gasless Transaction ────────────────────────────────────────────────────

export interface GaslessTransferParams extends TokenTransferParams {
  feeAmount?: string;
  feeRecipient?: string;
}

export interface GaslessBulkTransferParams extends BulkTransferParams {
  feeAmount?: string;
  feeRecipient?: string;
}

export interface GaslessTransactionResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  message?: string;
}

// ─── Relay ──────────────────────────────────────────────────────────────────

export interface RelayConfig {
  relayerAddress: string;
  sponsorAddress: string;
  domainName?: string;
  domainVersion?: string;
  relayApiUrl?: string;
}

export interface RelayTransactionParams {
  target: string;
  data: string;
  userAddress: string;
}

export interface RelayResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  message?: string;
}

// ─── EIP-712 ────────────────────────────────────────────────────────────────

export interface EIP712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
}

export interface EIP712TypedData {
  domain: EIP712Domain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export type SignTypedDataFunction = (args: EIP712TypedData) => Promise<string>;

// ─── Contract Call ──────────────────────────────────────────────────────────

export interface ContractCallParams {
  contractAddress: string;
  functionName: string;
  params: unknown[];
  abi: unknown[];
  value?: string;
}

// ─── Email OTP Authentication ──────────────────────────────────────────

export interface SendEmailOtpResult {
  success: boolean;
  message?: string;
  isNewWallet: boolean;
}

export interface VerifyEmailOtpResult {
  success: boolean;
  walletAddress?: string;
  isNewWallet: boolean;
  message?: string;
}

// ─── Chain Config ───────────────────────────────────────────────────────────

export interface ChainInfo {
  chainId: number;
  name: string;
  blockchain: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  facilitatorAddress?: string;
  relayerAddress?: string;
}
