// ─── Main Class ──────────────────────────────────────────────────────────────
export { KalpMPCWallet } from './KalpMPCWallet';

// ─── Crypto Primitives ───────────────────────────────────────────────────────
export {
  mod,
  modInverse,
  lagrangeCoefficient,
  CURVE_ORDER,
  generateSecureRandom,
  generateClientECDHKeyPair,
  deriveSharedSecret,
  encryptAES,
  decryptAES,
  mpcSign,
  mpcSignEIP712,
  combinePartialSignatures,
  determineRecoveryBit,
  runDKG,
} from './crypto';

// ─── Transaction Builders ────────────────────────────────────────────────────
export { buildAndSignTransaction, sendTokenTransfer } from './transaction/builder';
export { sendGaslessTransfer, sendGaslessBulkTransfer } from './transaction/gasless';
export { sendBulkTransfer } from './transaction/bulk';

// ─── Relay ───────────────────────────────────────────────────────────────────
export { KalpRelay } from './relay';

// ─── RPC ─────────────────────────────────────────────────────────────────────
export { rpcCall, getRpcUrl, setRpcUrl } from './rpc';

// ─── Storage ─────────────────────────────────────────────────────────────────
export { LocalStorageKeyStore, InMemoryKeyStore } from './storage';

// ─── Constants ───────────────────────────────────────────────────────────────
export {
  FACILITATOR_BY_CHAIN,
  RELAYER_BY_CHAIN,
  DEFAULT_FEE_RECIPIENT,
  DEFAULT_SPONSOR_ADDRESS,
  DEFAULT_RELAY_API_URL,
  DEFAULT_API_BASE_URL,
  CHAIN_RPC_MAPPING,
} from './constants';

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  KalpMPCConfig,
  KeyStore,
  WalletInfo,
  ECDSASignature,
  TransactionRequest,
  TransactionResult,
  TokenTransferParams,
  BulkTransferRecipient,
  BulkTransferParams,
  GaslessTransferParams,
  GaslessBulkTransferParams,
  GaslessTransactionResult,
  RelayConfig,
  RelayTransactionParams,
  RelayResult,
  EIP712Domain,
  EIP712TypedData,
  SignTypedDataFunction,
  ContractCallParams,
  ChainInfo,
} from './types';
