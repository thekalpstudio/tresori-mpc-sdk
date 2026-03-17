import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';
import {
  getIdentityContracts,
  IDENTITY_REGISTRY_ABI,
  CREDENTIAL_REGISTRY_ABI,
  CREDENTIAL_TYPES,
  IDENTITY_CHAIN_IDS,
} from '../constants/contracts';

/* ─────────────────────────────────────────────────────────────────────────────
 * Identity & KYC — On-Chain Decentralized Identity Module
 *
 * This module demonstrates a complete on-chain identity lifecycle:
 *   Step 1 — Create a W3C-compliant DID (Decentralized Identifier)
 *   Step 2 — Undergo KYC/AML verification and receive on-chain credentials
 *   Step 3 — Link additional wallets to share a single verified identity
 *
 * Business context:
 *   Financial institutions, RWA platforms, and regulated DeFi protocols need
 *   to verify counterparties before allowing asset transfers. This module
 *   anchors identity and KYC attestations on-chain so that any smart contract
 *   can call `verify(address, credentialType)` to gate transactions.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Props {
  wallet: KalpMPCWallet;
}

interface IdentityInfo {
  did: string;
  owner: string;
  controllers: string[];
  metadataURI: string;
  status: number;
  createdAt: number;
  updatedAt: number;
}

interface CredStatus {
  label: string;
  hash: string;
  verified: boolean | null;
  loading: boolean;
}

/* ── DID Document metadata form fields ── */
interface DIDDocumentFields {
  displayName: string;
  organization: string;
  entityType: 'individual' | 'organization';
  jurisdiction: string;
  website: string;
  description: string;
}

/* ── localStorage helpers for persisting DID Documents ── */
const STORAGE_PREFIX = 'kalp-did-doc:';

interface StoredDIDDoc {
  document: object;
  cid?: string;
  url?: string;
  createdAt: string;
}

function saveDIDDocument(metadataHash: string, doc: StoredDIDDoc) {
  try {
    localStorage.setItem(STORAGE_PREFIX + metadataHash, JSON.stringify(doc));
  } catch { /* quota exceeded — silently fail */ }
}

function loadStoredDIDDocument(metadataHash: string): StoredDIDDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + metadataHash);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Active',
  1: 'Suspended',
  2: 'Revoked',
};

const STATUS_COLORS: Record<number, string> = {
  0: 'cred-pass',
  1: 'cred-loading',
  2: 'cred-fail',
};

const STEP_INFO = [
  {
    num: 1,
    title: 'Create Identity (DID)',
    desc: 'Generate a W3C-compliant Decentralized Identifier anchored on-chain. Your DID Document metadata is pinned to IPFS for permanent, verifiable storage.',
  },
  {
    num: 2,
    title: 'KYC Verification',
    desc: 'Receive verifiable credentials (KYC/AML, Accredited Investor, Sanctions Clearance) issued by a trusted on-chain issuer. These credentials are checked by smart contracts before allowing regulated transactions.',
  },
  {
    num: 3,
    title: 'Link Wallets',
    desc: 'Attach additional wallet addresses to your DID. All linked wallets share your verified identity and credentials — no need to KYC each wallet separately.',
  },
];

const JURISDICTIONS = [
  'United States', 'United Kingdom', 'European Union', 'Singapore',
  'Hong Kong', 'Japan', 'Switzerland', 'Canada', 'Australia',
  'United Arab Emirates', 'India', 'South Korea', 'Other',
];

/* ── Build W3C DID Document JSON ── */
function buildDIDDocument(
  did: string | null,
  walletAddress: string,
  chainId: number,
  fields: DIDDocumentFields
): object {
  const didId = did || `did:kalp:${chainId}:${walletAddress}`;
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/secp256k1-2019/v1',
    ],
    id: didId,
    controller: [didId],
    verificationMethod: [
      {
        id: `${didId}#key-1`,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: didId,
        blockchainAccountId: `eip155:${chainId}:${walletAddress}`,
      },
    ],
    authentication: [`${didId}#key-1`],
    service: fields.website
      ? [{ id: `${didId}#website`, type: 'LinkedDomains', serviceEndpoint: fields.website }]
      : [],
    metadata: {
      displayName: fields.displayName,
      organization: fields.organization || undefined,
      entityType: fields.entityType,
      jurisdiction: fields.jurisdiction,
      description: fields.description || undefined,
      created: new Date().toISOString(),
    },
  };
}

/* ── IPFS pinning via Pinata ── */
async function pinToIPFS(
  jsonContent: object,
  pinataJWT: string
): Promise<{ cid: string; url: string }> {
  const body = JSON.stringify({
    pinataContent: jsonContent,
    pinataMetadata: { name: 'DID-Document' },
  });

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pinataJWT}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    cid: data.IpfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
  };
}

export function IdentityKYCTab({ wallet }: Props) {
  const contracts = getIdentityContracts(wallet.currentChainId);
  const wrongChain = !contracts;

  // ── Identity state ──
  const [myDID, setMyDID] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [credStatuses, setCredStatuses] = useState<CredStatus[]>([]);
  const [activeStep, setActiveStep] = useState(1);

  // ── DID Document form ──
  const [didFields, setDidFields] = useState<DIDDocumentFields>({
    displayName: '',
    organization: '',
    entityType: 'individual',
    jurisdiction: 'United States',
    website: '',
    description: '',
  });
  const [pinataJWT, setPinataJWT] = useState('');
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [ipfsResult, setIpfsResult] = useState<{ cid: string; url: string } | null>(null);

  // ── Stored DID Document (persisted in localStorage) ──
  const [storedDoc, setStoredDoc] = useState<StoredDIDDoc | null>(null);
  const [showDIDDoc, setShowDIDDoc] = useState(false);
  const [fetchingIPFS, setFetchingIPFS] = useState(false);

  // ── Add controller (link wallet) ──
  const [newController, setNewController] = useState('');

  // ── Issue credential (issuer flow) ──
  const [issueAddress, setIssueAddress] = useState('');
  const [issueCredType, setIssueCredType] = useState(CREDENTIAL_TYPES[0].hash);
  const [issueExpiry, setIssueExpiry] = useState('');

  // ── UI state ──
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load identity on mount / chain change ──
  useEffect(() => {
    if (!wrongChain) {
      loadMyIdentity();
    }
  }, [wallet.currentChainId, wallet.address]);

  // ── Auto-advance step based on identity state ──
  useEffect(() => {
    if (identity) {
      const hasAnyCredential = credStatuses.some(s => s.verified === true);
      if (hasAnyCredential) {
        setActiveStep(3);
      } else {
        setActiveStep(2);
      }
    } else {
      setActiveStep(1);
    }
  }, [identity, credStatuses]);

  const clearMsg = () => { setResult(null); setError(null); };

  const exec = async (fn: () => Promise<string>) => {
    setLoading(true);
    clearMsg();
    try {
      setResult(await fn());
    } catch (e: any) {
      setError(e.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Load current wallet's DID + identity + credentials ──
  async function loadMyIdentity() {
    if (!contracts) return;
    try {
      const did = await wallet.readContract(
        contracts.IdentityRegistry,
        IDENTITY_REGISTRY_ABI,
        'resolveDID',
        [wallet.address]
      );
      const didResult = did as any;
      const didStr: string = didResult[0] ?? didResult;
      if (!didStr || didStr === ethers.constants.HashZero) {
        setMyDID(null);
        setIdentity(null);
        setCredStatuses([]);
        return;
      }

      setMyDID(didStr);

      const identityResult = await wallet.readContract(
        contracts.IdentityRegistry,
        IDENTITY_REGISTRY_ABI,
        'getIdentity',
        [didStr]
      ) as any;
      const raw = identityResult[0] ?? identityResult;

      const metaHash = raw.metadataURI ?? raw[3];
      setIdentity({
        did: raw.did ?? raw[0],
        owner: raw.owner ?? raw[1],
        controllers: [...(raw.controllers ?? raw[2] ?? [])],
        metadataURI: metaHash,
        status: Number(raw.status ?? raw[4]),
        createdAt: Number(raw.createdAt ?? raw[5]),
        updatedAt: Number(raw.updatedAt ?? raw[6]),
      });

      // Load stored DID Document from localStorage
      if (metaHash && metaHash !== ethers.constants.HashZero) {
        const stored = loadStoredDIDDocument(metaHash);
        setStoredDoc(stored);
        // Restore IPFS info if available
        if (stored?.cid && stored?.url) {
          setIpfsResult({ cid: stored.cid, url: stored.url });
        }
      }

      loadCredentials();
    } catch {
      setMyDID(null);
      setIdentity(null);
    }
  }

  async function loadCredentials() {
    if (!contracts) return;
    const initial: CredStatus[] = CREDENTIAL_TYPES.map(c => ({
      label: c.label,
      hash: c.hash,
      verified: null,
      loading: true,
    }));
    setCredStatuses(initial);

    const updated = await Promise.all(
      CREDENTIAL_TYPES.map(async (c, i) => {
        try {
          const res = await wallet.readContract(
            contracts.CredentialRegistry,
            CREDENTIAL_REGISTRY_ABI,
            'verify',
            [wallet.address, c.hash]
          ) as any;
          const ok = res[0] ?? res;
          return { ...initial[i], verified: !!ok, loading: false };
        } catch {
          return { ...initial[i], verified: false, loading: false };
        }
      })
    );
    setCredStatuses(updated);
  }

  // ── Computed: DID Document preview ──
  const didDocument = buildDIDDocument(myDID, wallet.address ?? '', wallet.currentChainId, didFields);

  // ── Step 1: Create Identity with IPFS-pinned DID Document ──
  const handleCreateIdentity = () =>
    exec(async () => {
      if (!contracts) throw new Error('Wrong chain');
      if (!didFields.displayName.trim()) throw new Error('Display name is required');

      let metaBytes32: string;
      let ipfsInfo: { cid: string; url: string } | null = null;

      const doc = buildDIDDocument(null, wallet.address ?? '', wallet.currentChainId, didFields);

      if (pinataJWT.trim()) {
        // Pin DID Document to IPFS via Pinata
        ipfsInfo = await pinToIPFS(doc, pinataJWT.trim());
        setIpfsResult(ipfsInfo);
        // Store keccak256(CID) as bytes32 on-chain (CID is too long for bytes32)
        metaBytes32 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ipfsInfo.cid));
      } else {
        // Fallback: hash the DID Document content locally (no IPFS pinning)
        const docJson = JSON.stringify(doc);
        metaBytes32 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(docJson));
      }

      // Persist the DID Document to localStorage keyed by the on-chain metadata hash
      const storedEntry: StoredDIDDoc = {
        document: doc,
        cid: ipfsInfo?.cid,
        url: ipfsInfo?.url,
        createdAt: new Date().toISOString(),
      };
      saveDIDDocument(metaBytes32, storedEntry);
      setStoredDoc(storedEntry);

      const tx = await wallet.callContract({
        contractAddress: contracts.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'createIdentity',
        params: [metaBytes32],
      });

      setTimeout(() => loadMyIdentity(), 3000);

      const lines = [
        'Identity created successfully!',
        `Tx Hash: ${tx.txHash}`,
      ];
      if (ipfsInfo) {
        lines.push(`IPFS CID: ${ipfsInfo.cid}`);
        lines.push(`DID Document: ${ipfsInfo.url}`);
      }
      lines.push('\nReloading identity...');
      return lines.join('\n');
    });

  // ── Step 2: Issue KYC credential (via deployer/issuer wallet) ──
  const handleIssueCredential = () =>
    exec(async () => {
      if (!contracts) throw new Error('Wrong chain');

      const targetAddr = issueAddress || wallet.address;

      // Resolve the target address to a DID
      const didResult = await wallet.readContract(
        contracts.IdentityRegistry,
        IDENTITY_REGISTRY_ABI,
        'resolveDID',
        [targetAddr]
      ) as any;
      const targetDID: string = didResult[0] ?? didResult;

      if (!targetDID || targetDID === ethers.constants.HashZero) {
        throw new Error('Target address has no DID. Create identity first (Step 1).');
      }

      const now = Math.floor(Date.now() / 1000);
      const expiryTs = issueExpiry
        ? Math.floor(new Date(issueExpiry).getTime() / 1000)
        : now + 365 * 86400;

      if (expiryTs <= now) {
        throw new Error('Expiry must be in the future. Select a future date/time.');
      }

      const dataHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'bytes32', 'uint256'],
          [targetAddr, issueCredType, expiryTs]
        )
      );

      // Use the deployer (registered issuer) to sign and send
      const ISSUER_PK = '5c018d7b02bbbbecc8fafbbe8dcd1752c44fd0e3aa587dcda15bc203b9b48ec5';
      const provider = new ethers.providers.JsonRpcProvider(
        'https://rpc-amoy.polygon.technology',
        80002
      );
      const issuerWallet = new ethers.Wallet(ISSUER_PK, provider);

      // EIP-712 signature from the issuer
      const domain = {
        name: 'OnChainIdentity',
        version: '1',
        chainId: 80002,
        verifyingContract: contracts.CredentialRegistry,
      };
      const types = {
        Credential: [
          { name: 'did', type: 'bytes32' },
          { name: 'credType', type: 'bytes32' },
          { name: 'dataHash', type: 'bytes32' },
          { name: 'expiresAt', type: 'uint256' },
        ],
      };
      const value = {
        did: targetDID,
        credType: issueCredType,
        dataHash,
        expiresAt: expiryTs,
      };

      const signature = await issuerWallet._signTypedData(domain, types, value);

      const credRegistry = new ethers.Contract(
        contracts.CredentialRegistry,
        CREDENTIAL_REGISTRY_ABI,
        issuerWallet
      );

      const tx = await credRegistry.issue(
        targetDID,
        issueCredType,
        dataHash,
        expiryTs,
        signature,
        {
          gasLimit: 300000,
          maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei'),
          maxFeePerGas: ethers.utils.parseUnits('50', 'gwei'),
        }
      );
      const receipt = await tx.wait();

      setTimeout(() => loadCredentials(), 2000);

      const credLabel = CREDENTIAL_TYPES.find(c => c.hash === issueCredType)?.label ?? 'Unknown';
      return [
        `${credLabel} credential issued successfully!`,
        `Tx Hash: ${receipt.transactionHash}`,
        `Issuer: ${issuerWallet.address}`,
        `Target: ${targetAddr}`,
        `Expires: ${new Date(expiryTs * 1000).toLocaleDateString()}`,
      ].join('\n');
    });

  // ── Step 3: Add Controller (link wallet) ──
  const handleAddController = () =>
    exec(async () => {
      if (!contracts || !myDID) throw new Error('No DID found');
      if (!newController) throw new Error('Enter a wallet address');

      const tx = await wallet.callContract({
        contractAddress: contracts.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'addController',
        params: [myDID, newController],
      });

      setNewController('');
      setTimeout(() => loadMyIdentity(), 3000);
      return `Wallet linked successfully!\nTx Hash: ${tx.txHash}\nLinked Address: ${newController}`;
    });

  const handleRemoveController = (addr: string) =>
    exec(async () => {
      if (!contracts || !myDID) throw new Error('No DID found');

      const tx = await wallet.callContract({
        contractAddress: contracts.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'removeController',
        params: [myDID, addr],
      });

      setTimeout(() => loadMyIdentity(), 3000);
      return `Wallet unlinked!\nTx Hash: ${tx.txHash}\nRemoved: ${addr}`;
    });

  const handleRefresh = () => {
    clearMsg();
    loadMyIdentity();
  };

  // ── Fetch DID Document from IPFS gateway ──
  const handleFetchFromIPFS = async () => {
    if (!ipfsResult?.cid || !identity) return;
    setFetchingIPFS(true);
    try {
      const res = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsResult.cid}`);
      if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
      const doc = await res.json();
      const entry: StoredDIDDoc = {
        document: doc,
        cid: ipfsResult.cid,
        url: ipfsResult.url,
        createdAt: new Date().toISOString(),
      };
      saveDIDDocument(identity.metadataURI, entry);
      setStoredDoc(entry);
    } catch (e: any) {
      setError(`Failed to fetch from IPFS: ${e.message}`);
    } finally {
      setFetchingIPFS(false);
    }
  };

  const updateField = <K extends keyof DIDDocumentFields>(key: K, value: DIDDocumentFields[K]) => {
    setDidFields(prev => ({ ...prev, [key]: value }));
  };

  /* ═══════════════════════════════════════════════════════════════════════════
   *  RENDER
   * ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="kyc-module">
      {/* ── Module Header ── */}
      <div className="kyc-header">
        <h2>On-Chain Identity & KYC</h2>
        <p className="kyc-subtitle">
          Decentralized identity and verifiable credential management for regulated digital asset operations.
          Built on W3C DID standards with on-chain credential verification.
        </p>
      </div>

      {/* ── Business Context Banner ── */}
      <div className="kyc-banner">
        <div className="kyc-banner-title">How It Works</div>
        <div className="kyc-banner-grid">
          <div className="kyc-banner-item">
            <span className="kyc-banner-num">1</span>
            <div>
              <strong>Identity Registration</strong>
              <p>Create a DID anchored on-chain with metadata pinned to IPFS</p>
            </div>
          </div>
          <div className="kyc-banner-item">
            <span className="kyc-banner-num">2</span>
            <div>
              <strong>KYC Credential Issuance</strong>
              <p>Trusted issuers attest KYC/AML compliance as on-chain credentials</p>
            </div>
          </div>
          <div className="kyc-banner-item">
            <span className="kyc-banner-num">3</span>
            <div>
              <strong>Compliance Verification</strong>
              <p>Smart contracts call <code>verify()</code> to gate asset transfers</p>
            </div>
          </div>
        </div>
      </div>

      {wrongChain && (
        <div className="result-box result-error" style={{ marginBottom: 16 }}>
          Identity contracts are deployed on chains {IDENTITY_CHAIN_IDS.join(', ')}.
          Current chain: {wallet.currentChainId}. Please switch to Polygon Amoy (80002).
        </div>
      )}

      {!wrongChain && (
        <>
          {/* ── Step Indicator ── */}
          <div className="kyc-steps">
            {STEP_INFO.map(s => (
              <button
                key={s.num}
                className={`kyc-step-btn ${activeStep === s.num ? 'kyc-step-active' : ''} ${
                  (s.num === 1 && identity) || (s.num === 2 && credStatuses.some(c => c.verified))
                    ? 'kyc-step-done'
                    : ''
                }`}
                onClick={() => setActiveStep(s.num)}
              >
                <span className="kyc-step-num">
                  {(s.num === 1 && identity) || (s.num === 2 && credStatuses.some(c => c.verified))
                    ? '\u2713'
                    : s.num}
                </span>
                <span className="kyc-step-title">{s.title}</span>
              </button>
            ))}
          </div>

          {/* ── Step Description ── */}
          <div className="kyc-step-desc">
            {STEP_INFO[activeStep - 1].desc}
          </div>

          {/* ── Identity Dashboard (always visible when DID exists) ── */}
          {identity && (
            <fieldset className="identity-fieldset kyc-dashboard">
              <legend>Identity Dashboard</legend>
              <div className="identity-info-grid">
                <div>
                  <strong>DID</strong>
                  <code className="did-display">{myDID}</code>
                </div>
                <div>
                  <strong>Status</strong>
                  <span className={`status-pill ${STATUS_COLORS[identity.status] || ''}`}>
                    {STATUS_LABELS[identity.status] || 'Unknown'}
                  </span>
                </div>
                <div>
                  <strong>Owner</strong>
                  <code className="did-display">{identity.owner}</code>
                </div>
                <div>
                  <strong>Created</strong>
                  <span>{new Date(identity.createdAt * 1000).toLocaleDateString()}</span>
                </div>
                {identity.metadataURI && identity.metadataURI !== ethers.constants.HashZero && (
                  <div>
                    <strong>Metadata Hash</strong>
                    <code className="did-display">{identity.metadataURI}</code>
                  </div>
                )}
                {ipfsResult && (
                  <div>
                    <strong>IPFS DID Document</strong>
                    <a
                      href={ipfsResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kyc-link"
                    >
                      {ipfsResult.cid}
                    </a>
                  </div>
                )}
              </div>

              {/* DID Document Viewer */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong className="kyc-section-label">DID Document</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {storedDoc ? (
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={() => setShowDIDDoc(!showDIDDoc)}
                      >
                        {showDIDDoc ? 'Hide' : 'View'} Document
                      </button>
                    ) : ipfsResult?.cid ? (
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={handleFetchFromIPFS}
                        disabled={fetchingIPFS}
                      >
                        {fetchingIPFS ? 'Fetching...' : 'Fetch from IPFS'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#999' }}>
                        No stored document found
                      </span>
                    )}
                  </div>
                </div>
                {showDIDDoc && storedDoc && (
                  <div style={{ marginTop: 8 }}>
                    {storedDoc.cid && (
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                        IPFS CID: <a href={storedDoc.url} target="_blank" rel="noopener noreferrer" className="kyc-link">{storedDoc.cid}</a>
                      </div>
                    )}
                    <pre className="kyc-json-preview">
                      {JSON.stringify(storedDoc.document, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Credential Status */}
              <div style={{ marginTop: 16 }}>
                <strong className="kyc-section-label">Credential Status</strong>
                <div className="cred-grid" style={{ marginTop: 6 }}>
                  {credStatuses.map(s => (
                    <div
                      key={s.hash}
                      className={`cred-pill ${s.loading ? 'cred-loading' : s.verified ? 'cred-pass' : 'cred-fail'}`}
                    >
                      <span className="cred-pill-label">{s.label}</span>
                      <span>{s.loading ? '...' : s.verified ? 'Verified' : 'Missing'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Wallets */}
              <div style={{ marginTop: 16 }}>
                <strong className="kyc-section-label">Linked Wallets</strong>
                <div style={{ marginTop: 6 }}>
                  <div className="linked-wallet">
                    <code>{identity.owner}</code>
                    <span className="badge badge-gasless">Owner</span>
                  </div>
                  {identity.controllers.map(addr => (
                    <div key={addr} className="linked-wallet">
                      <code>{addr}</code>
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleRemoveController(addr)}
                        disabled={loading}
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn-secondary" style={{ marginTop: 12 }} onClick={handleRefresh}>
                Refresh
              </button>
            </fieldset>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
           *  STEP 1 — Create DID Identity
           * ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 1 && !identity && (
            <fieldset className="identity-fieldset">
              <legend>Step 1 — Create Decentralized Identity</legend>

              <div className="kyc-info-box">
                <strong>What is a DID?</strong>
                <p>
                  A Decentralized Identifier (DID) is a globally unique, self-sovereign identity
                  anchored on the blockchain. Unlike traditional identity systems, DIDs are not
                  controlled by any central authority. Your DID Document — containing your public
                  identity metadata — is pinned to IPFS for permanent, censorship-resistant storage,
                  while the on-chain record ensures tamper-proof verification.
                </p>
              </div>

              <div className="kyc-form-section">
                <h4 className="kyc-form-title">Identity Information</h4>

                <div className="form-row">
                  <div className="form-group">
                    <label>Display Name *</label>
                    <input
                      type="text"
                      value={didFields.displayName}
                      onChange={e => updateField('displayName', e.target.value)}
                      placeholder="e.g. John Smith or Acme Corp"
                    />
                  </div>
                  <div className="form-group">
                    <label>Organization</label>
                    <input
                      type="text"
                      value={didFields.organization}
                      onChange={e => updateField('organization', e.target.value)}
                      placeholder="e.g. Acme Financial Services"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Entity Type</label>
                    <select
                      value={didFields.entityType}
                      onChange={e => updateField('entityType', e.target.value as 'individual' | 'organization')}
                    >
                      <option value="individual">Individual</option>
                      <option value="organization">Organization</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Jurisdiction</label>
                    <select
                      value={didFields.jurisdiction}
                      onChange={e => updateField('jurisdiction', e.target.value)}
                    >
                      {JURISDICTIONS.map(j => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Website (optional)</label>
                    <input
                      type="url"
                      value={didFields.website}
                      onChange={e => updateField('website', e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description (optional)</label>
                    <input
                      type="text"
                      value={didFields.description}
                      onChange={e => updateField('description', e.target.value)}
                      placeholder="Brief description of entity"
                    />
                  </div>
                </div>
              </div>

              {/* IPFS Pinning Config */}
              <div className="kyc-form-section">
                <h4 className="kyc-form-title">IPFS Storage (Pinata)</h4>
                <p className="kyc-form-hint">
                  Your DID Document will be pinned to IPFS via Pinata for permanent, decentralized storage.
                  Provide a Pinata JWT to pin the document. Without a JWT, the metadata hash will
                  still be stored on-chain but the document won't be available on IPFS.
                </p>
                <div className="form-group" style={{ maxWidth: 500 }}>
                  <label>Pinata JWT (optional)</label>
                  <input
                    type="password"
                    value={pinataJWT}
                    onChange={e => setPinataJWT(e.target.value)}
                    placeholder="eyJhbGciOi..."
                  />
                </div>
              </div>

              {/* DID Document Preview */}
              <div className="kyc-form-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 className="kyc-form-title" style={{ margin: 0 }}>W3C DID Document Preview</h4>
                  <button
                    className="btn-secondary"
                    style={{ padding: '4px 14px', fontSize: 12 }}
                    onClick={() => setShowDocPreview(!showDocPreview)}
                  >
                    {showDocPreview ? 'Hide' : 'Show'} Preview
                  </button>
                </div>
                {showDocPreview && (
                  <pre className="kyc-json-preview">
                    {JSON.stringify(didDocument, null, 2)}
                  </pre>
                )}
              </div>

              <div className="actions" style={{ marginTop: 8 }}>
                <button
                  className="btn-primary"
                  onClick={handleCreateIdentity}
                  disabled={loading || wrongChain || !didFields.displayName.trim()}
                >
                  {loading ? 'Creating Identity...' : 'Create Identity & Pin to IPFS'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            </fieldset>
          )}

          {activeStep === 1 && identity && (
            <div className="kyc-info-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <strong>Step 1 Complete</strong>
              <p>Your decentralized identity has been created and anchored on-chain. Proceed to Step 2 to receive your KYC credentials.</p>
              <button
                className="btn-secondary"
                style={{ marginTop: 8 }}
                onClick={() => setActiveStep(2)}
              >
                Go to Step 2
              </button>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
           *  STEP 2 — KYC Credential Issuance
           * ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 2 && (
            <>
              {!identity ? (
                <div className="kyc-info-box" style={{ background: '#fef3c7', borderColor: '#fde68a' }}>
                  <strong>Identity Required</strong>
                  <p>You need to create a DID (Step 1) before receiving KYC credentials.</p>
                </div>
              ) : (
                <fieldset className="identity-fieldset">
                  <legend>Step 2 — KYC Credential Issuance</legend>

                  <div className="kyc-info-box">
                    <strong>How Credential Issuance Works</strong>
                    <p>
                      In a production environment, a trusted third-party KYC provider (e.g., Jumio,
                      Onfido, SumSub) verifies the user's identity off-chain and then issues an
                      on-chain verifiable credential. The credential is cryptographically signed
                      using EIP-712 and stored on the CredentialRegistry smart contract.
                    </p>
                    <p style={{ marginTop: 6 }}>
                      For this demo, credentials are issued by a pre-registered trusted issuer.
                      Any smart contract can then call <code>verify(address, credType)</code> to
                      check if a wallet holds a valid, non-expired credential.
                    </p>
                  </div>

                  <div className="linked-wallet" style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>Trusted Issuer:</span>
                    <code>0xC1ccA3D4225CFF920a22ca937230ceC06F28F9BF</code>
                    <span className="badge badge-gasless">Tier 2 KYC Provider</span>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Target Wallet Address</label>
                      <input
                        type="text"
                        value={issueAddress}
                        onChange={e => setIssueAddress(e.target.value)}
                        placeholder={wallet.address || '0x...'}
                      />
                      <span className="kyc-form-hint">
                        Leave empty to issue to your own wallet
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Credential Type</label>
                      <select value={issueCredType} onChange={e => setIssueCredType(e.target.value)}>
                        {CREDENTIAL_TYPES.map(c => (
                          <option key={c.hash} value={c.hash}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 12, maxWidth: 300 }}>
                    <label>Credential Expiry (optional, default: 1 year)</label>
                    <input
                      type="datetime-local"
                      value={issueExpiry}
                      onChange={e => setIssueExpiry(e.target.value)}
                    />
                  </div>

                  {/* Credential Type Explainer */}
                  <div className="kyc-cred-explainer">
                    <div className="kyc-cred-explainer-item">
                      <strong>KYC / AML</strong>
                      <span>Anti-money laundering and know-your-customer verification</span>
                    </div>
                    <div className="kyc-cred-explainer-item">
                      <strong>Accredited Investor</strong>
                      <span>SEC-defined accredited investor status (Reg D, 506(c))</span>
                    </div>
                    <div className="kyc-cred-explainer-item">
                      <strong>Sanctions Clear</strong>
                      <span>OFAC / EU sanctions list clearance verification</span>
                    </div>
                    <div className="kyc-cred-explainer-item">
                      <strong>RWA Holder</strong>
                      <span>Authorized to hold tokenized real-world assets</span>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    onClick={handleIssueCredential}
                    disabled={loading || wrongChain}
                  >
                    {loading ? 'Signing & Issuing Credential...' : 'Issue Credential'}
                  </button>
                </fieldset>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
           *  STEP 3 — Link Additional Wallets
           * ═══════════════════════════════════════════════════════════════════ */}
          {activeStep === 3 && (
            <>
              {!identity ? (
                <div className="kyc-info-box" style={{ background: '#fef3c7', borderColor: '#fde68a' }}>
                  <strong>Identity Required</strong>
                  <p>Complete Step 1 and Step 2 before linking wallets.</p>
                </div>
              ) : (
                <fieldset className="identity-fieldset">
                  <legend>Step 3 — Link Additional Wallets</legend>

                  <div className="kyc-info-box">
                    <strong>Multi-Wallet Identity</strong>
                    <p>
                      In institutional and enterprise use cases, a single verified identity often
                      needs to operate through multiple wallet addresses (e.g., trading desk wallets,
                      custody wallets, operational wallets). Linking wallets to your DID means each
                      linked address inherits your KYC credentials — eliminating redundant
                      verification and reducing compliance overhead.
                    </p>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Wallet Address to Link</label>
                      <input
                        type="text"
                        value={newController}
                        onChange={e => setNewController(e.target.value)}
                        placeholder="0x..."
                      />
                    </div>
                    <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn-primary"
                        onClick={handleAddController}
                        disabled={loading || wrongChain || !newController}
                      >
                        {loading ? 'Linking...' : 'Link Wallet'}
                      </button>
                    </div>
                  </div>
                </fieldset>
              )}
            </>
          )}
        </>
      )}

      {/* ── Status Messages ── */}
      {loading && <div className="result-box result-loading">Processing on-chain transaction...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}

      {/* ── Technical Architecture (collapsible) ── */}
      <details className="kyc-architecture">
        <summary>Technical Architecture</summary>
        <div className="kyc-arch-content">
          <p><strong>Smart Contract Stack</strong></p>
          <ul>
            <li><strong>IdentityRegistry</strong> — Stores DIDs, ownership, controllers, and metadata hashes. UUPS upgradeable proxy.</li>
            <li><strong>CredentialRegistry</strong> — Stores verifiable credentials with EIP-712 signatures from trusted issuers.</li>
            <li><strong>IssuerRegistry</strong> — Maintains a tiered registry of authorized credential issuers.</li>
            <li><strong>Facade</strong> — Unified entry point for <code>verify(address, credType)</code> — resolves DID, checks credential validity.</li>
            <li><strong>DelegationManager</strong> — Agent DID creation and granular permission management.</li>
          </ul>
          <p style={{ marginTop: 12 }}><strong>Verification Flow</strong></p>
          <ol>
            <li>RWA token contract calls <code>Facade.verify(sender, KYC_AML)</code></li>
            <li>Facade resolves sender address to DID via <code>IdentityRegistry.resolveDID()</code></li>
            <li>Facade checks credential in <code>CredentialRegistry</code> — must be valid, non-expired, non-revoked</li>
            <li>If verification fails, the token transfer reverts with a compliance error</li>
          </ol>
          <p style={{ marginTop: 12 }}><strong>Data Flow</strong></p>
          <p>
            Identity metadata (W3C DID Document) is stored on IPFS. Only <code>keccak256(CID)</code> is
            stored on-chain as <code>bytes32 metadataURI</code>, keeping gas costs minimal while enabling
            off-chain verification of the full document against its on-chain hash.
          </p>
        </div>
      </details>
    </div>
  );
}
