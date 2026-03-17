import { mod, CURVE_ORDER } from './math';

const getCrypto = (): Crypto => {
  if (typeof globalThis.crypto !== 'undefined') return globalThis.crypto;
  throw new Error('Web Crypto API is not available in this environment');
};

export function generateSecureRandom(): bigint {
  const bytes = new Uint8Array(32);
  getCrypto().getRandomValues(bytes);
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) + BigInt(byte);
  }
  return mod(result, CURVE_ORDER);
}

export async function generateClientECDHKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyHex: string;
}> {
  const keyPair = await getCrypto().subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const publicKeyBuffer = await getCrypto().subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyHex = Array.from(new Uint8Array(publicKeyBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { keyPair, publicKeyHex };
}

export async function deriveSharedSecret(
  privateKey: CryptoKey,
  otherPublicKeyHex: string
): Promise<CryptoKey> {
  const otherPublicKeyBuffer = new Uint8Array(
    otherPublicKeyHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const otherPublicKey = await getCrypto().subtle.importKey(
    'raw',
    otherPublicKeyBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedBits = await getCrypto().subtle.deriveBits(
    { name: 'ECDH', public: otherPublicKey },
    privateKey,
    256
  );

  const hashedKey = await getCrypto().subtle.digest('SHA-256', sharedBits);

  const aesKey = await getCrypto().subtle.importKey(
    'raw',
    hashedKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}

export async function decryptAES(
  encryptedHex: string,
  key: CryptoKey,
  ivHex: string,
  authTagHex: string
): Promise<string> {
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(
    encryptedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const authTag = new Uint8Array(authTagHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));

  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const decryptedBuffer = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    combined
  );

  return new TextDecoder().decode(decryptedBuffer);
}

export async function encryptAES(
  data: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string; authTag: string }> {
  const iv = getCrypto().getRandomValues(new Uint8Array(12));
  const dataBuffer = new TextEncoder().encode(data);

  const encryptedBuffer = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  const encrypted = new Uint8Array(encryptedBuffer);
  const ciphertext = encrypted.slice(0, -16);
  const authTag = encrypted.slice(-16);

  return {
    encrypted: Array.from(ciphertext)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    iv: Array.from(iv)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    authTag: Array.from(authTag)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  };
}
