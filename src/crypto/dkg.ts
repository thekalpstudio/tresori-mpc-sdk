import { mod, evaluatePolynomial, toHex, fromHex, CURVE_ORDER } from './math';
import { generateSecureRandom, generateClientECDHKeyPair, deriveSharedSecret, decryptAES, encryptAES } from './ecdh';
import { ethers } from 'ethers';
import type { KeyStore, WalletInfo } from '../types';

export interface DKGOptions {
  userId: string;
  chainId: number;
  apiBaseUrl: string;
  apiKey: string;
  keyStore: KeyStore;
}

export async function runDKG(options: DKGOptions): Promise<WalletInfo> {
  const { userId, chainId, apiBaseUrl, apiKey, keyStore } = options;

  // ── STEP 1: Generate client secret and polynomial ──
  const clientSecret = generateSecureRandom();
  const a1 = generateSecureRandom();
  const coefficients = [clientSecret, a1];

  // Evaluate polynomial at points 1, 2, 3
  const fc1 = evaluatePolynomial(coefficients, 1);
  const fc2 = evaluatePolynomial(coefficients, 2);
  const fc3 = evaluatePolynomial(coefficients, 3);

  // Derive public commitment: P_c = s_c * G
  const commitmentWallet = new ethers.Wallet(toHex(clientSecret));
  const clientPublicCommitment = commitmentWallet.publicKey;

  // ── STEP 2: Generate ECDH key pair for enclave communication ──
  const { keyPair, publicKeyHex } = await generateClientECDHKeyPair();

  // ── STEP 3: Call DKG init ──
  const initResponse = await fetch(`${apiBaseUrl}/v2/wallet/mpc/dkg-init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apiKey: apiKey,
    },
    body: JSON.stringify({
      clientShare2Contribution: toHex(fc2),
      clientPublicCommitment: clientPublicCommitment,
      clientEncryptionPubKey: publicKeyHex,
      chainId: chainId,
      userId: userId,
    }),
  });

  if (!initResponse.ok) {
    const errData = await initResponse.json();
    throw new Error(errData.error || errData.message || 'DKG init failed');
  }

  const initJson = await initResponse.json();
  const initResult = initJson?.result?.data;
  if (!initResult || !initResult.sessionId) {
    throw new Error(
      `DKG init: invalid response. Keys received: ${initResult ? Object.keys(initResult).join(', ') : 'none'}. Full response: ${JSON.stringify(initJson).slice(0, 500)}`
    );
  }

  console.log('[DKG] init response keys:', Object.keys(initResult));

  const {
    sessionId,
    serverShare1Contribution,
    enclaveShare1Contribution,
    enclaveShare1IV,
    enclaveShare1AuthTag,
    enclaveEncryptionPubKey,
    address,
  } = initResult;

  // Validate all required fields exist before using them
  const missing = [];
  if (!serverShare1Contribution) missing.push('serverShare1Contribution');
  if (!enclaveShare1Contribution) missing.push('enclaveShare1Contribution');
  if (!enclaveShare1IV) missing.push('enclaveShare1IV');
  if (!enclaveShare1AuthTag) missing.push('enclaveShare1AuthTag');
  if (!enclaveEncryptionPubKey) missing.push('enclaveEncryptionPubKey');
  if (missing.length > 0) {
    throw new Error(
      `DKG init: missing fields [${missing.join(', ')}]. Available keys: ${Object.keys(initResult).join(', ')}`
    );
  }

  // ── STEP 4: Derive shared secret with enclave ──
  const aesKey = await deriveSharedSecret(keyPair.privateKey, enclaveEncryptionPubKey);

  // ── STEP 5: Decrypt enclave's f_e(1) contribution ──
  const decryptedFe1 = await decryptAES(
    enclaveShare1Contribution,
    aesKey,
    enclaveShare1IV,
    enclaveShare1AuthTag
  );
  const fe1 = fromHex(decryptedFe1);

  // ── STEP 6: Encrypt client's f_c(3) for enclave ──
  const encryptedFc3 = await encryptAES(toHex(fc3), aesKey);

  // ── STEP 7: Call DKG contribute ──
  const contributeResponse = await fetch(`${apiBaseUrl}/v2/wallet/mpc/dkg-contribute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apiKey: apiKey,
    },
    body: JSON.stringify({
      sessionId: sessionId,
      encryptedClientShare3Contribution: encryptedFc3.encrypted,
      iv: encryptedFc3.iv,
      authTag: encryptedFc3.authTag,
      chainId: chainId,
      userId: userId,
    }),
  });

  if (!contributeResponse.ok) {
    const errData = await contributeResponse.json();
    throw new Error(errData.error || errData.message || 'DKG contribute failed');
  }

  const contributeJson = await contributeResponse.json();
  const contributeResult = contributeJson?.result;
  console.log('[DKG] contribute response keys:', contributeResult ? Object.keys(contributeResult) : 'none');

  // ── STEP 8: Compute final client share ──
  const fs1 = fromHex(serverShare1Contribution);
  const newClientShare = mod(fc1 + fs1 + fe1, CURVE_ORDER);

  // Address comes from the contribute response, with multiple fallbacks
  const walletAddress =
    contributeResult?.walletAddress ||
    contributeResult?.address ||
    contributeResult?.ethereumAddress ||
    contributeResult?.data?.walletAddress ||
    contributeResult?.data?.address ||
    address; // fallback to init response address

  // Ultimate fallback: derive address from the computed private key
  const finalAddress = walletAddress || new ethers.Wallet(toHex(newClientShare)).address;
  console.log('[DKG] Wallet address:', finalAddress);

  const finalSessionId = contributeResult?.sessionId || contributeResult?.data?.sessionId || sessionId;

  // ── Store key material ──
  await keyStore.set('clientShare1', toHex(newClientShare));
  await keyStore.set('sessionId', finalSessionId);
  await keyStore.set('address', finalAddress);
  await keyStore.set('chainId', chainId.toString());

  return {
    address: finalAddress,
    sessionId: finalSessionId,
    chainId,
  };
}
