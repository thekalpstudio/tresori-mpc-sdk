import { ethers } from 'ethers';
import { toHex, rlpUint } from '../crypto/math';
import { createMPCSigner, mpcSign } from '../crypto/mpc';
import { rpcCall } from '../rpc';
import { FACILITATOR_BY_CHAIN } from '../constants';
import type { TransactionResult, BulkTransferParams } from '../types';

export interface BulkTransferOptions {
  fromAddress: string;
  chainId: number;
  clientShare: string;
  sessionId: string;
  apiBaseUrl: string;
  apiKey: string;
  rpcUrl?: string;
}

export async function sendBulkTransfer(
  params: BulkTransferParams,
  options: BulkTransferOptions
): Promise<TransactionResult> {
  const { fromAddress, chainId, clientShare, sessionId, apiBaseUrl, apiKey, rpcUrl } = options;
  const { tokenAddress, recipients, decimals = 18 } = params;

  const facilitatorAddress = FACILITATOR_BY_CHAIN[chainId];
  if (!facilitatorAddress) {
    throw new Error(`No ERC20Facilitator contract deployed for chain ${chainId}`);
  }

  const parsedRecipients = recipients.map((r) => ({
    to: r.to,
    amount: ethers.utils.parseUnits(r.amount, decimals),
  }));
  const totalValue = parsedRecipients.reduce(
    (sum, r) => sum.add(r.amount),
    ethers.BigNumber.from(0)
  );

  // ── Step 1: Sign EIP-2612 Permit ──
  const nonceIface = new ethers.utils.Interface([
    'function nonces(address owner) view returns (uint256)',
  ]);
  const nameIface = new ethers.utils.Interface(['function name() view returns (string)']);

  const [permitNonceResult, nameResult] = await Promise.all([
    rpcCall('eth_call', [{ to: tokenAddress, data: nonceIface.encodeFunctionData('nonces', [fromAddress]) }, 'latest'], chainId, rpcUrl),
    rpcCall('eth_call', [{ to: tokenAddress, data: nameIface.encodeFunctionData('name') }, 'latest'], chainId, rpcUrl),
  ]);

  const permitNonce = ethers.BigNumber.from(permitNonceResult);
  const [tokenName] = nameIface.decodeFunctionResult('name', nameResult);

  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const mpcSigner = createMPCSigner(fromAddress, clientShare, sessionId, apiBaseUrl, apiKey);

  const permitSignature = await mpcSigner({
    domain: {
      name: tokenName,
      version: '1',
      chainId,
      verifyingContract: tokenAddress as `0x${string}`,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner: fromAddress,
      spender: facilitatorAddress,
      value: totalValue,
      nonce: permitNonce,
      deadline,
    },
  });

  const sig = ethers.utils.splitSignature(permitSignature);

  // ── Step 2: Build raw transaction ──
  const facilitatorIface = new ethers.utils.Interface([
    'function facilitateBulkTransferWithPermit(address token, address owner, tuple(address to, uint256 amount)[] recipients, uint256 totalValue, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  ]);
  const calldata = facilitatorIface.encodeFunctionData('facilitateBulkTransferWithPermit', [
    tokenAddress,
    fromAddress,
    parsedRecipients.map((r) => [r.to, r.amount]),
    totalValue,
    deadline,
    sig.v,
    sig.r,
    sig.s,
  ]);

  // ── Step 3: Build and sign EIP-1559 transaction ──
  const [txNonceHex, gasPriceHex] = await Promise.all([
    rpcCall('eth_getTransactionCount', [fromAddress, 'pending'], chainId, rpcUrl),
    rpcCall('eth_gasPrice', [], chainId, rpcUrl),
  ]);

  const txNonce = parseInt(txNonceHex, 16);
  const gasPrice = BigInt(gasPriceHex);
  const oneGwei = 1000000000n;
  const minTip = (chainId === 137 || chainId === 80002) ? 25n * oneGwei : oneGwei;
  let maxPriorityFeePerGas = gasPrice / 5n;
  if (maxPriorityFeePerGas < minTip) maxPriorityFeePerGas = minTip;
  const maxFeePerGas = gasPrice * 2n;

  let gasLimit: bigint;
  try {
    const gasEstHex = await rpcCall(
      'eth_estimateGas',
      [{ from: fromAddress, to: facilitatorAddress, data: calldata }],
      chainId,
      rpcUrl
    );
    gasLimit = (BigInt(gasEstHex) * 130n) / 100n;
  } catch {
    gasLimit = 300000n;
  }

  const txFields = [
    rlpUint(chainId),
    rlpUint(txNonce),
    rlpUint(maxPriorityFeePerGas),
    rlpUint(maxFeePerGas),
    rlpUint(gasLimit),
    facilitatorAddress,
    '0x',
    calldata,
    [],
  ];

  const rlpEncoded = ethers.utils.RLP.encode(txFields);
  const unsignedTxBytes = ethers.utils.arrayify(ethers.utils.concat(['0x02', rlpEncoded]));
  const txHash = ethers.utils.keccak256(unsignedTxBytes);

  // MPC Sign
  const txSig = await mpcSign({
    messageHash: txHash,
    clientShare,
    sessionId,
    fromAddress,
    apiBaseUrl,
    apiKey,
  });

  const recoveryBit = txSig.v - 27;

  const signedTxFields = [
    rlpUint(chainId),
    rlpUint(txNonce),
    rlpUint(maxPriorityFeePerGas),
    rlpUint(maxFeePerGas),
    rlpUint(gasLimit),
    facilitatorAddress,
    '0x',
    calldata,
    [],
    recoveryBit === 0 ? '0x' : '0x01',
    txSig.r,
    txSig.s,
  ];

  const signedRlp = ethers.utils.RLP.encode(signedTxFields);
  const signedTxSerialized = '0x02' + signedRlp.slice(2);

  const broadcastResult = await rpcCall(
    'eth_sendRawTransaction',
    [signedTxSerialized],
    chainId,
    rpcUrl
  );

  return { txHash: broadcastResult };
}
