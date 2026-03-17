import { ethers } from 'ethers';
import type { RelayConfig, RelayTransactionParams, RelayResult, SignTypedDataFunction } from '../types';
import { retryWithBackoff, withTimeout, shouldRetryError, isValidAddress } from '../utils';
import { DEFAULT_RELAY_API_URL } from '../constants';

const RELAY_TYPE: Record<string, Array<{ name: string; type: string }>> = {
  RelayRequest: [
    { name: 'target', type: 'address' },
    { name: 'data', type: 'bytes' },
    { name: 'user', type: 'address' },
    { name: 'sponsor', type: 'address' },
    { name: 'chainId', type: 'uint256' },
  ],
};

export interface KalpRelayOptions {
  chainId: number;
  relayConfig: RelayConfig;
  signTypedData: SignTypedDataFunction;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
}

export class KalpRelay {
  private chainId: number;
  private config: RelayConfig;
  private signTypedData: SignTypedDataFunction;
  private apiKey?: string;
  private timeout: number;
  private maxRetries: number;

  constructor(options: KalpRelayOptions) {
    this.chainId = options.chainId;
    this.config = options.relayConfig;
    this.signTypedData = options.signTypedData;
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async execute(params: RelayTransactionParams): Promise<RelayResult> {
    if (!isValidAddress(params.userAddress)) {
      throw new Error('Invalid user address');
    }
    if (!isValidAddress(params.target)) {
      throw new Error('Invalid target address');
    }

    // Step 1: Sign the relay request with EIP-712
    const signature = await this.signRelayRequest(params);

    // Step 2: Submit to relay backend
    return this.submitRelayRequest(params, signature);
  }

  private async signRelayRequest(params: RelayTransactionParams): Promise<string> {
    const domain = {
      name: this.config.domainName || 'KalpRelayer',
      version: this.config.domainVersion || '1.0.0',
      chainId: this.chainId,
      verifyingContract: this.config.relayerAddress as `0x${string}`,
    };

    const message = {
      target: params.target,
      data: params.data,
      user: params.userAddress,
      sponsor: this.config.sponsorAddress,
      chainId: BigInt(this.chainId),
    };

    return withTimeout(
      this.signTypedData({
        domain,
        types: RELAY_TYPE,
        primaryType: 'RelayRequest',
        message: message as Record<string, unknown>,
      }),
      this.timeout
    );
  }

  private async submitRelayRequest(
    params: RelayTransactionParams,
    signature: string
  ): Promise<RelayResult> {
    const relayApiUrl = this.config.relayApiUrl || DEFAULT_RELAY_API_URL;

    return retryWithBackoff(
      async () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.apiKey) {
          headers['apiKey'] = this.apiKey;
        }

        const response = await fetch(relayApiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chainId: this.chainId,
            contractAddress: params.target,
            userAddress: params.userAddress,
            data: params.data,
            userSignature: signature,
            sponsor: this.config.sponsorAddress,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        if (data.message !== 'success') {
          throw new Error(data.error || data.message || 'Transaction failed');
        }

        return {
          txHash: data.result.txHash,
          blockNumber: data.result.blockNumber,
          gasUsed: data.result.gasUsed,
          message: data.message,
        };
      },
      {
        maxAttempts: this.maxRetries,
        shouldRetry: shouldRetryError,
      }
    );
  }

  encodeERC2771CallData(
    functionSignature: string,
    args: unknown[] = [],
    userAddress: string
  ): string {
    const iface = new ethers.utils.Interface([`function ${functionSignature}`]);
    const baseCallData = iface.encodeFunctionData(functionSignature.split('(')[0], args);
    return ethers.utils.hexlify(ethers.utils.concat([baseCallData, userAddress]));
  }
}
