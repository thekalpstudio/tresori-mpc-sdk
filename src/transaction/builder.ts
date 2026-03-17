import { ethers } from 'ethers';
import { toHex, rlpUint } from '../crypto/math';
import { mpcSign } from '../crypto/mpc';
import { rpcCall } from '../rpc';
import type { TransactionResult, TransactionRequest } from '../types';

export interface BuildAndSignOptions {
  fromAddress: string;
  to: string;
  data: string;
  value?: string;
  chainId: number;
  clientShare: string;
  sessionId: string;
  apiBaseUrl: string;
  apiKey: string;
  rpcUrl?: string;
}

export async function buildAndSignTransaction(
  options: BuildAndSignOptions
): Promise<TransactionResult> {
  const { fromAddress, to, data, chainId, clientShare, sessionId, apiBaseUrl, apiKey, rpcUrl } = options;

  // Fetch nonce and gas params
  const [nonceHex, gasPriceHex] = await Promise.all([
    rpcCall('eth_getTransactionCount', [fromAddress, 'pending'], chainId, rpcUrl),
    rpcCall('eth_gasPrice', [], chainId, rpcUrl),
  ]);

  const nonce = parseInt(nonceHex, 16);
  const gasPrice = BigInt(gasPriceHex);

  const oneGwei = 1000000000n;
  const minTip = (chainId === 137 || chainId === 80002) ? 25n * oneGwei : oneGwei;
  let maxPriorityFeePerGas = gasPrice / 5n;
  if (maxPriorityFeePerGas < minTip) maxPriorityFeePerGas = minTip;
  const maxFeePerGas = gasPrice * 2n; // cap maxFee at 2x gasPrice instead of gasPrice + tip

  // Estimate gas
  let gasLimit: bigint;
  try {
    const gasEstHex = await rpcCall(
      'eth_estimateGas',
      [{ from: fromAddress, to, data }],
      chainId,
      rpcUrl
    );
    gasLimit = (BigInt(gasEstHex) * 130n) / 100n; // 30% buffer
  } catch {
    gasLimit = 100000n;
  }

  // Build EIP-1559 unsigned transaction
  const value = options.value ? rlpUint(BigInt(options.value)) : '0x';
  const txFields = [
    rlpUint(chainId),
    rlpUint(nonce),
    rlpUint(maxPriorityFeePerGas),
    rlpUint(maxFeePerGas),
    rlpUint(gasLimit),
    to,
    value,
    data,
    [],
  ];

  // Serialize and hash
  const rlpEncoded = ethers.utils.RLP.encode(txFields);
  const unsignedTxBytes = ethers.utils.arrayify(ethers.utils.concat(['0x02', rlpEncoded]));
  const txHash = ethers.utils.keccak256(unsignedTxBytes);

  // MPC Sign
  const sig = await mpcSign({
    messageHash: txHash,
    clientShare,
    sessionId,
    fromAddress,
    apiBaseUrl,
    apiKey,
  });

  const recoveryBit = sig.v - 27;

  // Serialize signed transaction
  const signedTxFields = [
    rlpUint(chainId),
    rlpUint(nonce),
    rlpUint(maxPriorityFeePerGas),
    rlpUint(maxFeePerGas),
    rlpUint(gasLimit),
    to,
    value,
    data,
    [],
    recoveryBit === 0 ? '0x' : '0x01',
    sig.r,
    sig.s,
  ];

  const signedRlp = ethers.utils.RLP.encode(signedTxFields);
  const signedTxSerialized = '0x02' + signedRlp.slice(2);

  // Broadcast
  const broadcastResult = await rpcCall(
    'eth_sendRawTransaction',
    [signedTxSerialized],
    chainId,
    rpcUrl
  );

  return { txHash: broadcastResult };
}

export interface SendTokenTransferOptions {
  fromAddress: string;
  tokenAddress: string;
  to: string;
  amount: string;
  decimals?: number;
  chainId: number;
  clientShare: string;
  sessionId: string;
  apiBaseUrl: string;
  apiKey: string;
  rpcUrl?: string;
}

export async function sendTokenTransfer(
  options: SendTokenTransferOptions
): Promise<TransactionResult> {
  const { tokenAddress, to, amount, decimals = 18 } = options;

  const iface = new ethers.utils.Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
  ]);
  const parsedAmount = ethers.utils.parseUnits(amount, decimals);
  const calldata = iface.encodeFunctionData('transfer', [to, parsedAmount]);

  return buildAndSignTransaction({
    ...options,
    to: tokenAddress,
    data: calldata,
    value: undefined,
  });
}
