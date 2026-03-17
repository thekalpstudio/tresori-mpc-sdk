import { ethers } from 'ethers';
import { createMPCSigner } from '../crypto/mpc';
import { rpcCall } from '../rpc';
import { KalpRelay } from '../relay';
import {
  FACILITATOR_BY_CHAIN,
  RELAYER_BY_CHAIN,
  DEFAULT_FEE_RECIPIENT,
  DEFAULT_SPONSOR_ADDRESS,
} from '../constants';
import type { GaslessTransactionResult, GaslessTransferParams, GaslessBulkTransferParams } from '../types';

export interface GaslessOptions {
  fromAddress: string;
  chainId: number;
  clientShare: string;
  sessionId: string;
  apiBaseUrl: string;
  apiKey: string;
  rpcUrl?: string;
  relayApiUrl?: string;
  sponsorAddress?: string;
}

export async function sendGaslessTransfer(
  params: GaslessTransferParams,
  options: GaslessOptions
): Promise<GaslessTransactionResult> {
  const {
    fromAddress,
    chainId,
    clientShare,
    sessionId,
    apiBaseUrl,
    apiKey,
    rpcUrl,
    relayApiUrl,
    sponsorAddress,
  } = options;
  const { tokenAddress, to, amount, decimals = 18 } = params;

  const facilitatorAddress = FACILITATOR_BY_CHAIN[chainId];
  if (!facilitatorAddress) {
    throw new Error(`No ERC20Facilitator contract deployed for chain ${chainId}`);
  }

  const parsedAmount = ethers.utils.parseUnits(amount, decimals);
  const feeAmount = params.feeAmount
    ? ethers.utils.parseUnits(params.feeAmount, decimals)
    : ethers.utils.parseUnits('1', decimals);
  const totalValue = parsedAmount.add(feeAmount);
  const feeRecipient = params.feeRecipient || DEFAULT_FEE_RECIPIENT;

  // ── Step 1: Get nonces and token name ──
  const nonceIface = new ethers.utils.Interface([
    'function nonces(address owner) view returns (uint256)',
  ]);
  const nameIface = new ethers.utils.Interface(['function name() view returns (string)']);
  const intentNonceIface = new ethers.utils.Interface([
    'function intentNonces(address owner) view returns (uint256)',
  ]);

  const [nonceResult, nameResult, intentNonceResult] = await Promise.all([
    rpcCall('eth_call', [{ to: tokenAddress, data: nonceIface.encodeFunctionData('nonces', [fromAddress]) }, 'latest'], chainId, rpcUrl),
    rpcCall('eth_call', [{ to: tokenAddress, data: nameIface.encodeFunctionData('name') }, 'latest'], chainId, rpcUrl),
    rpcCall('eth_call', [{ to: facilitatorAddress, data: intentNonceIface.encodeFunctionData('intentNonces', [fromAddress]) }, 'latest'], chainId, rpcUrl),
  ]);

  const nonce = ethers.BigNumber.from(nonceResult);
  const [tokenName] = nameIface.decodeFunctionResult('name', nameResult);
  const intentNonce = ethers.BigNumber.from(intentNonceResult);

  // ── Step 2: Sign EIP-2612 Permit ──
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
      value: totalValue.toString(),
      nonce: nonce,
      deadline: deadline,
    },
  });

  const sig = ethers.utils.splitSignature(permitSignature);

  // ── Step 3: Sign EIP-712 TransferWithFee intent ──
  const userSignature = await mpcSigner({
    domain: {
      name: 'ERC20Facilitator',
      version: '4.0.0',
      chainId,
      verifyingContract: facilitatorAddress as `0x${string}`,
    },
    types: {
      TransferWithFee: [
        { name: 'token', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'feeRecipient', type: 'address' },
        { name: 'feeAmount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'TransferWithFee',
    message: {
      token: tokenAddress,
      to,
      value: parsedAmount.toString(),
      feeRecipient,
      feeAmount: feeAmount.toString(),
      nonce: intentNonce,
      deadline,
    },
  });

  // ── Step 4: Encode facilitator calldata ──
  const facilitatorIface = new ethers.utils.Interface([
    'function facilitateTransferWithFee(address token, address owner, address to, uint256 value, address feeRecipient, uint256 feeAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes userSignature)',
  ]);
  const facilitatorCalldata = facilitatorIface.encodeFunctionData('facilitateTransferWithFee', [
    tokenAddress,
    fromAddress,
    to,
    parsedAmount,
    feeRecipient,
    feeAmount,
    deadline,
    sig.v,
    sig.r,
    sig.s,
    userSignature,
  ]);

  // Append user address for ERC-2771 format
  const encodedData = ethers.utils.hexlify(
    ethers.utils.concat([facilitatorCalldata, ethers.utils.arrayify(fromAddress)])
  );

  // ── Step 5: Relay ──
  const relayerAddress = RELAYER_BY_CHAIN[chainId];
  if (!relayerAddress) {
    throw new Error(`No relayer address for chain ${chainId}`);
  }

  const relay = new KalpRelay({
    chainId,
    relayConfig: {
      relayerAddress,
      sponsorAddress: sponsorAddress || DEFAULT_SPONSOR_ADDRESS,
      domainName: 'KalpRelayer',
      domainVersion: '1.0.0',
      relayApiUrl,
    },
    signTypedData: mpcSigner,
    apiKey,
  });

  return relay.execute({
    target: facilitatorAddress,
    data: encodedData,
    userAddress: fromAddress,
  });
}

export async function sendGaslessBulkTransfer(
  params: GaslessBulkTransferParams,
  options: GaslessOptions
): Promise<GaslessTransactionResult> {
  const {
    fromAddress,
    chainId,
    clientShare,
    sessionId,
    apiBaseUrl,
    apiKey,
    rpcUrl,
    relayApiUrl,
    sponsorAddress,
  } = options;
  const { tokenAddress, recipients, decimals = 18 } = params;

  const facilitatorAddress = FACILITATOR_BY_CHAIN[chainId];
  if (!facilitatorAddress) {
    throw new Error(`No ERC20Facilitator contract deployed for chain ${chainId}`);
  }

  const feeAmount = params.feeAmount
    ? ethers.utils.parseUnits(params.feeAmount, decimals)
    : ethers.utils.parseUnits('1', decimals);
  const feeRecipient = params.feeRecipient || DEFAULT_FEE_RECIPIENT;

  const parsedRecipients = recipients.map((r) => ({
    to: r.to,
    amount: ethers.utils.parseUnits(r.amount, decimals),
  }));
  const totalValue = parsedRecipients.reduce(
    (sum, r) => sum.add(r.amount),
    ethers.BigNumber.from(0)
  );
  const permitValue = totalValue.add(feeAmount);

  // ── Step 1: Get nonces and token name ──
  const nonceIface = new ethers.utils.Interface([
    'function nonces(address owner) view returns (uint256)',
  ]);
  const nameIface = new ethers.utils.Interface(['function name() view returns (string)']);
  const intentNonceIface = new ethers.utils.Interface([
    'function intentNonces(address owner) view returns (uint256)',
  ]);

  const [nonceResult, nameResult, intentNonceResult] = await Promise.all([
    rpcCall('eth_call', [{ to: tokenAddress, data: nonceIface.encodeFunctionData('nonces', [fromAddress]) }, 'latest'], chainId, rpcUrl),
    rpcCall('eth_call', [{ to: tokenAddress, data: nameIface.encodeFunctionData('name') }, 'latest'], chainId, rpcUrl),
    rpcCall('eth_call', [{ to: facilitatorAddress, data: intentNonceIface.encodeFunctionData('intentNonces', [fromAddress]) }, 'latest'], chainId, rpcUrl),
  ]);

  const nonce = ethers.BigNumber.from(nonceResult);
  const [tokenName] = nameIface.decodeFunctionResult('name', nameResult);
  const intentNonce = ethers.BigNumber.from(intentNonceResult);

  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const mpcSigner = createMPCSigner(fromAddress, clientShare, sessionId, apiBaseUrl, apiKey);

  // ── Step 2: Sign EIP-2612 Permit ──
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
      value: permitValue.toString(),
      nonce,
      deadline,
    },
  });

  const sig = ethers.utils.splitSignature(permitSignature);

  // ── Step 3: Sign BulkTransferWithFee intent ──
  const abiCoder = ethers.utils.defaultAbiCoder;
  const recipientsEncoded = abiCoder.encode(
    ['tuple(address to, uint256 amount)[]'],
    [parsedRecipients.map((r) => [r.to, r.amount])]
  );
  const recipientsHash = ethers.utils.keccak256(recipientsEncoded);

  const userSignature = await mpcSigner({
    domain: {
      name: 'ERC20Facilitator',
      version: '4.0.0',
      chainId,
      verifyingContract: facilitatorAddress as `0x${string}`,
    },
    types: {
      BulkTransferWithFee: [
        { name: 'token', type: 'address' },
        { name: 'recipientsHash', type: 'bytes32' },
        { name: 'totalValue', type: 'uint256' },
        { name: 'feeRecipient', type: 'address' },
        { name: 'feeAmount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'BulkTransferWithFee',
    message: {
      token: tokenAddress,
      recipientsHash,
      totalValue: totalValue.toString(),
      feeRecipient,
      feeAmount: feeAmount.toString(),
      nonce: intentNonce,
      deadline,
    },
  });

  // ── Step 4: Encode facilitator calldata ──
  const facilitatorIface = new ethers.utils.Interface([
    'function facilitateBulkTransferWithFee(address token, address owner, tuple(address to, uint256 amount)[] recipients, uint256 totalValue, address feeRecipient, uint256 feeAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s, bytes userSignature)',
  ]);
  const facilitatorCalldata = facilitatorIface.encodeFunctionData('facilitateBulkTransferWithFee', [
    tokenAddress,
    fromAddress,
    parsedRecipients.map((r) => [r.to, r.amount]),
    totalValue,
    feeRecipient,
    feeAmount,
    deadline,
    sig.v,
    sig.r,
    sig.s,
    userSignature,
  ]);

  const encodedData = ethers.utils.hexlify(
    ethers.utils.concat([facilitatorCalldata, ethers.utils.arrayify(fromAddress)])
  );

  // ── Step 5: Relay ──
  const relayerAddress = RELAYER_BY_CHAIN[chainId];
  if (!relayerAddress) {
    throw new Error(`No relayer address for chain ${chainId}`);
  }

  const relay = new KalpRelay({
    chainId,
    relayConfig: {
      relayerAddress,
      sponsorAddress: sponsorAddress || DEFAULT_SPONSOR_ADDRESS,
      domainName: 'KalpRelayer',
      domainVersion: '1.0.0',
      relayApiUrl,
    },
    signTypedData: mpcSigner,
    apiKey,
  });

  return relay.execute({
    target: facilitatorAddress,
    data: encodedData,
    userAddress: fromAddress,
  });
}
