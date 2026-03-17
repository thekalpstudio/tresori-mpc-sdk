import { ethers } from 'ethers';
import { runDKG } from './crypto/dkg';
import { mpcSign, mpcSignEIP712, createMPCSigner } from './crypto/mpc';
import { buildAndSignTransaction, sendTokenTransfer } from './transaction/builder';
import { sendGaslessTransfer, sendGaslessBulkTransfer } from './transaction/gasless';
import { sendBulkTransfer } from './transaction/bulk';
import { KalpRelay } from './relay';
import { rpcCall, setRpcUrl } from './rpc';
import { LocalStorageKeyStore, InMemoryKeyStore } from './storage';
import { DEFAULT_API_BASE_URL, FACILITATOR_BY_CHAIN, RELAYER_BY_CHAIN, CHAIN_API_MAPPING } from './constants';
import type {
  KalpMPCConfig,
  KeyStore,
  WalletInfo,
  TransactionResult,
  TokenTransferParams,
  BulkTransferParams,
  GaslessTransferParams,
  GaslessBulkTransferParams,
  GaslessTransactionResult,
  EIP712TypedData,
  ECDSASignature,
  ContractCallParams,
  SignTypedDataFunction,
  SendEmailOtpResult,
  VerifyEmailOtpResult,
} from './types';

export class KalpMPCWallet {
  private apiKey: string;
  private apiBaseUrl: string;
  private chainId: number;
  private rpcUrl?: string;
  private keyStore: KeyStore;
  private _address: string | null = null;
  private _sessionId: string | null = null;
  private _clientShare: string | null = null;
  private _initialized = false;

  constructor(config: KalpMPCConfig) {
    this.apiKey = config.apiKey;
    this.apiBaseUrl = config.baseUrl || DEFAULT_API_BASE_URL;
    this.chainId = config.chainId;
    this.rpcUrl = config.rpcUrl;
    this.keyStore = config.keyStore || (typeof window !== 'undefined' ? new LocalStorageKeyStore() : new InMemoryKeyStore());

    if (config.rpcUrl) {
      setRpcUrl(config.chainId, config.rpcUrl);
    }
  }

  // ─── Initialization ────────────────────────────────────────────────────────

  async init(): Promise<boolean> {
    try {
      this._clientShare = await this.keyStore.get('clientShare1');
      this._sessionId = await this.keyStore.get('sessionId');
      this._address = await this.keyStore.get('address');
      this._initialized = !!(this._clientShare && this._sessionId && this._address);
      return this._initialized;
    } catch {
      return false;
    }
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get address(): string | null {
    return this._address;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get currentChainId(): number {
    return this.chainId;
  }

  // ─── Wallet Creation (DKG) ─────────────────────────────────────────────────

  async createWallet(userId: string): Promise<WalletInfo> {
    const walletInfo = await runDKG({
      userId,
      chainId: this.chainId,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      keyStore: this.keyStore,
    });

    this._address = walletInfo.address;
    this._sessionId = walletInfo.sessionId;
    this._clientShare = await this.keyStore.get('clientShare1');
    this._initialized = true;

    return walletInfo;
  }

  // ─── Import Existing Wallet ────────────────────────────────────────────────

  async importWallet(address: string, sessionId: string, clientShare: string): Promise<void> {
    await this.keyStore.set('clientShare1', clientShare);
    await this.keyStore.set('sessionId', sessionId);
    await this.keyStore.set('address', address);

    this._address = address;
    this._sessionId = sessionId;
    this._clientShare = clientShare;
    this._initialized = true;
  }

  // ─── Chain Management ──────────────────────────────────────────────────────

  switchChain(chainId: number, rpcUrl?: string): void {
    this.chainId = chainId;
    if (rpcUrl) {
      this.rpcUrl = rpcUrl;
      setRpcUrl(chainId, rpcUrl);
    }
  }

  // ─── Signing ───────────────────────────────────────────────────────────────

  async signMessage(messageHash: string): Promise<ECDSASignature> {
    this.ensureInitialized();
    return mpcSign({
      messageHash,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      fromAddress: this._address!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
    });
  }

  async signTypedData(typedData: EIP712TypedData): Promise<string> {
    this.ensureInitialized();
    return mpcSignEIP712(
      typedData,
      this._clientShare!,
      this._sessionId!,
      this._address!,
      this.apiBaseUrl,
      this.apiKey
    );
  }

  getSignTypedDataFunction(): SignTypedDataFunction {
    this.ensureInitialized();
    return createMPCSigner(
      this._address!,
      this._clientShare!,
      this._sessionId!,
      this.apiBaseUrl,
      this.apiKey
    );
  }

  // ─── Token Transfer (User Pays Gas) ────────────────────────────────────────

  async sendTokenTransfer(params: TokenTransferParams): Promise<TransactionResult> {
    this.ensureInitialized();
    return sendTokenTransfer({
      fromAddress: this._address!,
      tokenAddress: params.tokenAddress,
      to: params.to,
      amount: params.amount,
      decimals: params.decimals,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Raw Transaction (User Pays Gas) ───────────────────────────────────────

  async sendTransaction(to: string, data: string, value?: string): Promise<TransactionResult> {
    this.ensureInitialized();
    return buildAndSignTransaction({
      fromAddress: this._address!,
      to,
      data,
      value,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Contract Call (User Pays Gas) ─────────────────────────────────────────

  async callContract(params: ContractCallParams): Promise<TransactionResult> {
    this.ensureInitialized();
    const iface = new ethers.utils.Interface(params.abi as string[]);
    const calldata = iface.encodeFunctionData(params.functionName, params.params);

    return buildAndSignTransaction({
      fromAddress: this._address!,
      to: params.contractAddress,
      data: calldata,
      value: params.value,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Read-Only Contract Call ───────────────────────────────────────────────

  async readContract(
    contractAddress: string,
    abi: string[],
    functionName: string,
    params: unknown[] = []
  ): Promise<unknown> {
    const iface = new ethers.utils.Interface(abi);
    const calldata = iface.encodeFunctionData(functionName, params);

    const result = await rpcCall(
      'eth_call',
      [{ to: contractAddress, data: calldata }, 'latest'],
      this.chainId,
      this.rpcUrl
    );

    return iface.decodeFunctionResult(functionName, result);
  }

  // ─── Bulk Transfer (User Pays Gas) ─────────────────────────────────────────

  async sendBulkTransfer(params: BulkTransferParams): Promise<TransactionResult> {
    this.ensureInitialized();
    return sendBulkTransfer(params, {
      fromAddress: this._address!,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Gasless Transfer ──────────────────────────────────────────────────────

  async sendGaslessTransfer(params: GaslessTransferParams): Promise<GaslessTransactionResult> {
    this.ensureInitialized();
    return sendGaslessTransfer(params, {
      fromAddress: this._address!,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Gasless Bulk Transfer ─────────────────────────────────────────────────

  async sendGaslessBulkTransfer(
    params: GaslessBulkTransferParams
  ): Promise<GaslessTransactionResult> {
    this.ensureInitialized();
    return sendGaslessBulkTransfer(params, {
      fromAddress: this._address!,
      chainId: this.chainId,
      clientShare: this._clientShare!,
      sessionId: this._sessionId!,
      apiBaseUrl: this.apiBaseUrl,
      apiKey: this.apiKey,
      rpcUrl: this.rpcUrl,
    });
  }

  // ─── Email OTP Authentication ──────────────────────────────────────────

  private getChainApiParams(): { blockchain: string; network: string } {
    return CHAIN_API_MAPPING[this.chainId] || { blockchain: 'ETH', network: 'SEPOLIA' };
  }

  /**
   * Send an email OTP for wallet login/creation.
   * The API will send a 4-digit OTP to the provided email address.
   */
  async sendEmailOtp(email: string): Promise<SendEmailOtpResult> {
    const { blockchain, network } = this.getChainApiParams();

    // First check if MPC wallet exists for this email
    let walletExists = false;
    try {
      const checkRes = await fetch(`${this.apiBaseUrl}/auth/is-mpc-exist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiKey: this.apiKey },
        body: JSON.stringify({ blockchain, network, walletIdentifier: email }),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        walletExists = !!checkData?.result?.isMPCExists;
      }
    } catch {
      // If check fails, proceed with send anyway
    }

    const payload: Record<string, string> = {
      email,
      userId: email,
      blockchain,
      network,
      walletType: 'MPC',
    };
    if (walletExists) {
      payload.type = 'verify';
    }

    const res = await fetch(`${this.apiBaseUrl}/auth/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiKey: this.apiKey },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      // Error code 101021 means wallet doesn't exist — retry without type
      if (errData?.customErrorNumber === 101021) {
        delete payload.type;
        const retryRes = await fetch(`${this.apiBaseUrl}/auth/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apiKey: this.apiKey },
          body: JSON.stringify(payload),
        });
        if (!retryRes.ok) {
          const retryErr = await retryRes.json().catch(() => ({}));
          throw new Error(retryErr?.message || `Failed to send OTP (${retryRes.status})`);
        }
        const retryData = await retryRes.json();
        return {
          success: true,
          message: retryData?.result?.status?.message || 'OTP sent',
          isNewWallet: true,
        };
      }
      throw new Error(errData?.message || `Failed to send OTP (${res.status})`);
    }

    const data = await res.json();
    return {
      success: true,
      message: data?.result?.status?.message || 'OTP sent',
      isNewWallet: !walletExists,
    };
  }

  /**
   * Verify email OTP. If wallet exists, loads wallet keys.
   * If wallet is new, runs DKG to create the wallet.
   * Returns the wallet info on success.
   */
  async verifyEmailOtp(email: string, otp: string): Promise<WalletInfo> {
    const { blockchain, network } = this.getChainApiParams();

    // Check if wallet already exists
    let walletExists = false;
    try {
      const checkRes = await fetch(`${this.apiBaseUrl}/auth/is-mpc-exist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiKey: this.apiKey },
        body: JSON.stringify({ blockchain, network, walletIdentifier: email }),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        walletExists = !!checkData?.result?.isMPCExists;
      }
    } catch {
      // Continue with verify
    }

    const payload: Record<string, string> = {
      email,
      otp,
      userId: email,
      blockchain,
      network,
      walletType: 'MPC',
    };
    if (walletExists) {
      payload.type = 'verify';
    }

    const res = await fetch(`${this.apiBaseUrl}/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiKey: this.apiKey },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.message || `OTP verification failed (${res.status})`);
    }

    const data = await res.json();
    const result = data?.result?.status;
    const parentResult = data?.result;

    // If server returns wallet address, wallet already exists — load it
    const walletAddress = result?.walletAddress || parentResult?.walletAddress;
    if (walletAddress) {
      // Look for sessionId at multiple paths and field names
      const sessionId =
        result?.mpc_session_id || result?.recoverySessionId || result?.sessionId || result?.session_id ||
        parentResult?.mpc_session_id || parentResult?.recoverySessionId || parentResult?.sessionId;
      // Look for clientShare at multiple paths and field names
      const userShard =
        result?.newClientShare || result?.userShard || result?.clientShare1 || result?.user_shard ||
        parentResult?.newClientShare || parentResult?.userShard;

      // Store wallet details
      await this.keyStore.set('address', walletAddress);
      if (sessionId) {
        await this.keyStore.set('sessionId', sessionId);
      }
      if (userShard) {
        await this.keyStore.set('clientShare1', userShard);
      }

      this._address = walletAddress;
      this._sessionId = sessionId || await this.keyStore.get('sessionId');
      this._clientShare = userShard || await this.keyStore.get('clientShare1');
      this._initialized = !!(this._clientShare && this._sessionId && this._address);

      return {
        address: walletAddress,
        sessionId: this._sessionId || '',
        chainId: this.chainId,
      };
    }

    // Wallet doesn't exist — run DKG to create it
    return this.createWallet(email);
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  async getBalance(): Promise<string> {
    this.ensureInitialized();
    const balanceHex = await rpcCall(
      'eth_getBalance',
      [this._address!, 'latest'],
      this.chainId,
      this.rpcUrl
    );
    return ethers.utils.formatEther(balanceHex);
  }

  async getTokenBalance(tokenAddress: string, decimals = 18): Promise<string> {
    this.ensureInitialized();
    const iface = new ethers.utils.Interface([
      'function balanceOf(address account) view returns (uint256)',
    ]);
    const result = await rpcCall(
      'eth_call',
      [
        { to: tokenAddress, data: iface.encodeFunctionData('balanceOf', [this._address!]) },
        'latest',
      ],
      this.chainId,
      this.rpcUrl
    );
    const [balance] = iface.decodeFunctionResult('balanceOf', result);
    return ethers.utils.formatUnits(balance, decimals);
  }

  async getNonce(): Promise<number> {
    this.ensureInitialized();
    const nonceHex = await rpcCall(
      'eth_getTransactionCount',
      [this._address!, 'latest'],
      this.chainId,
      this.rpcUrl
    );
    return parseInt(nonceHex, 16);
  }

  getFacilitatorAddress(): string | undefined {
    return FACILITATOR_BY_CHAIN[this.chainId];
  }

  getRelayerAddress(): string | undefined {
    return RELAYER_BY_CHAIN[this.chainId];
  }

  async disconnect(): Promise<void> {
    await this.keyStore.remove('clientShare1');
    await this.keyStore.remove('sessionId');
    await this.keyStore.remove('address');
    await this.keyStore.remove('chainId');
    this._address = null;
    this._sessionId = null;
    this._clientShare = null;
    this._initialized = false;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this._initialized || !this._clientShare || !this._sessionId || !this._address) {
      throw new Error(
        'Wallet not initialized. Call createWallet() or importWallet() first, or call init() to load existing keys.'
      );
    }
  }
}
