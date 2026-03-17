import { ethers } from 'ethers';
import { mod, modInverse, lagrangeCoefficient, toHex, fromHex, CURVE_ORDER } from './math';
import { generateSecureRandom } from './ecdh';
import type { ECDSASignature, EIP712TypedData, SignTypedDataFunction } from '../types';

export interface MPCSignParams {
  messageHash: string;
  clientShare: string;
  sessionId: string;
  fromAddress: string;
  apiBaseUrl: string;
  apiKey: string;
}

export interface PartialSignatureResult {
  k: bigint;
  rX: bigint;
  partialS1: bigint;
}

export function computeClientPartialSignature(
  messageHash: string,
  clientShare: string
): PartialSignatureResult {
  const k = generateSecureRandom();
  const kWallet = new ethers.Wallet(toHex(k));
  const rPoint = kWallet.publicKey;
  const rX = fromHex('0x' + rPoint.slice(4, 68));
  const kInv = modInverse(k, CURVE_ORDER);
  const h = fromHex(messageHash);

  const hrd1 = mod(h + rX * fromHex(clientShare), CURVE_ORDER);
  const partialS1 = mod(kInv * hrd1, CURVE_ORDER);

  return { k, rX, partialS1 };
}

export function combinePartialSignatures(partialS1: bigint, partialS2: bigint): bigint {
  const lambda1 = lagrangeCoefficient(1, [1, 2]);
  const lambda2 = lagrangeCoefficient(2, [1, 2]);
  const l1s1 = mod(lambda1 * partialS1, CURVE_ORDER);
  const l2s2 = mod(lambda2 * partialS2, CURVE_ORDER);
  let combinedS = mod(l1s1 + l2s2, CURVE_ORDER);

  // EIP-2 normalization: ensure s is in lower half
  const halfN = CURVE_ORDER / 2n;
  if (combinedS > halfN) {
    combinedS = CURVE_ORDER - combinedS;
  }

  return combinedS;
}

export function determineRecoveryBit(
  messageHash: string,
  rX: bigint,
  combinedS: bigint,
  expectedAddress: string
): number {
  for (const tryV of [27, 28]) {
    try {
      const sigBytes = ethers.utils.concat([
        toHex(rX),
        toHex(combinedS),
        ethers.utils.hexZeroPad(ethers.utils.hexlify(tryV), 1),
      ]);
      const recoveredAddr = ethers.utils.recoverAddress(messageHash, sigBytes);
      if (recoveredAddr.toLowerCase() === expectedAddress.toLowerCase()) {
        return tryV - 27; // 0 or 1
      }
    } catch {
      // try next v
    }
  }
  throw new Error('Could not determine recovery parameter (v)');
}

async function requestServerPartialSignature(
  messageHash: string,
  k: bigint,
  rX: bigint,
  sessionId: string,
  apiBaseUrl: string,
  apiKey: string
): Promise<bigint> {
  const response = await fetch(`${apiBaseUrl}/v2/wallet/mpc/sign-simple`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apiKey: apiKey,
    },
    body: JSON.stringify({
      messageHash,
      sharedNonceK: toHex(k),
      r: toHex(rX),
      sessionId,
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Server signing failed');
  }

  const result = (await response.json())?.result?.data;
  return fromHex(result.partialSignature);
}

export async function mpcSign(params: MPCSignParams): Promise<ECDSASignature> {
  const { messageHash, clientShare, sessionId, fromAddress, apiBaseUrl, apiKey } = params;

  // Step 1: Client partial signature
  const { k, rX, partialS1 } = computeClientPartialSignature(messageHash, clientShare);

  // Step 2: Server partial signature
  const partialS2 = await requestServerPartialSignature(
    messageHash,
    k,
    rX,
    sessionId,
    apiBaseUrl,
    apiKey
  );

  // Step 3: Combine
  const combinedS = combinePartialSignatures(partialS1, partialS2);

  // Step 4: Recovery bit
  const recoveryBit = determineRecoveryBit(messageHash, rX, combinedS, fromAddress);

  return {
    r: toHex(rX),
    s: toHex(combinedS),
    v: recoveryBit + 27,
  };
}

export async function mpcSignEIP712(
  typedData: EIP712TypedData,
  clientShare: string,
  sessionId: string,
  fromAddress: string,
  apiBaseUrl: string,
  apiKey: string
): Promise<string> {
  const domain = typedData.domain || {};
  const eip712Hash = ethers.utils._TypedDataEncoder.hash(
    domain as Record<string, unknown>,
    typedData.types,
    typedData.message as Record<string, unknown>
  );

  const sig = await mpcSign({
    messageHash: eip712Hash,
    clientShare,
    sessionId,
    fromAddress,
    apiBaseUrl,
    apiKey,
  });

  const rHex = sig.r.slice(2).padStart(64, '0');
  const sHex = sig.s.slice(2).padStart(64, '0');
  const vHex = sig.v.toString(16).padStart(2, '0');

  return `0x${rHex}${sHex}${vHex}`;
}

export function createMPCSigner(
  fromAddress: string,
  clientShare: string,
  sessionId: string,
  apiBaseUrl: string,
  apiKey: string
): SignTypedDataFunction {
  return async (args: EIP712TypedData) => {
    return mpcSignEIP712(args, clientShare, sessionId, fromAddress, apiBaseUrl, apiKey);
  };
}
