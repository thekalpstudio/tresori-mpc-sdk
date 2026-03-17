import React, { useState } from 'react';
import { ethers } from 'ethers';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';
import {
  getIdentityContracts,
  FACADE_ABI,
  CREDENTIAL_REGISTRY_ABI,
  ISSUER_REGISTRY_ABI,
  CREDENTIAL_TYPES,
  IDENTITY_CHAIN_IDS,
} from '../constants/contracts';

interface Props {
  wallet: KalpMPCWallet;
}

interface CredentialStatus {
  type: string;
  verified: boolean | null;
  loading: boolean;
}

export function CredentialsTab({ wallet }: Props) {
  // Verify single
  const [verifyAddr, setVerifyAddr] = useState('');
  const [verifyType, setVerifyType] = useState(CREDENTIAL_TYPES[0].hash);
  // View credential
  const [viewAddr, setViewAddr] = useState('');
  const [viewType, setViewType] = useState(CREDENTIAL_TYPES[0].hash);
  // Issue credential
  const [issueDID, setIssueDID] = useState('');
  const [issueType, setIssueType] = useState(CREDENTIAL_TYPES[0].hash);
  const [issueDataHash, setIssueDataHash] = useState('');
  const [issueExpiry, setIssueExpiry] = useState('');
  // Check issuer
  const [issuerAddr, setIssuerAddr] = useState('');
  const [issuerCredType, setIssuerCredType] = useState(CREDENTIAL_TYPES[0].hash);
  // Dashboard
  const [dashboardAddr, setDashboardAddr] = useState('');
  const [dashboard, setDashboard] = useState<CredentialStatus[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contracts = getIdentityContracts(wallet.currentChainId);
  const wrongChain = !contracts;

  const exec = async (fn: () => Promise<string>) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e: any) {
      setError(e.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = () =>
    exec(async () => {
      const res = await wallet.readContract(
        contracts!.Facade,
        FACADE_ABI,
        'verify',
        [verifyAddr, verifyType]
      ) as any;
      const ok = res[0] ?? res;
      const label = CREDENTIAL_TYPES.find((c) => c.hash === verifyType)?.label ?? verifyType;
      return `${label} for ${verifyAddr}: ${ok ? 'VERIFIED' : 'NOT VERIFIED'}`;
    });

  const handleViewCredential = () =>
    exec(async () => {
      const rawRes = await wallet.readContract(
        contracts!.Facade,
        FACADE_ABI,
        'getCredential',
        [viewAddr, viewType]
      ) as any;
      const cred = rawRes[0] ?? rawRes;
      const issuer = cred.issuer ?? cred[0];
      const dataHash = cred.dataHash ?? cred[2];
      const issuedAt = cred.issuedAt ?? cred[3];
      const expiresAt = cred.expiresAt ?? cred[4];
      const revoked = cred.revoked ?? cred[5];
      const label = CREDENTIAL_TYPES.find((c) => c.hash === viewType)?.label ?? viewType;
      return [
        `Credential: ${label}`,
        `Issuer: ${issuer}`,
        `Data Hash: ${dataHash}`,
        `Issued At: ${new Date(Number(issuedAt) * 1000).toLocaleString()}`,
        `Expires At: ${new Date(Number(expiresAt) * 1000).toLocaleString()}`,
        `Revoked: ${revoked}`,
      ].join('\n');
    });

  const handleIssue = () =>
    exec(async () => {
      const expiryTs = Math.floor(new Date(issueExpiry).getTime() / 1000);
      // EIP-712 signature for credential issuance
      const signature = await wallet.signTypedData({
        domain: {
          name: 'CredentialRegistry',
          version: '1',
          chainId: wallet.currentChainId,
          verifyingContract: contracts!.CredentialRegistry,
        },
        types: {
          Credential: [
            { name: 'did', type: 'bytes32' },
            { name: 'credType', type: 'bytes32' },
            { name: 'dataHash', type: 'bytes32' },
            { name: 'expiresAt', type: 'uint256' },
          ],
        },
        primaryType: 'Credential',
        message: {
          did: issueDID,
          credType: issueType,
          dataHash: issueDataHash || ethers.constants.HashZero,
          expiresAt: expiryTs,
        },
      });

      const tx = await wallet.callContract({
        contractAddress: contracts!.CredentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: 'issue',
        params: [
          issueDID,
          issueType,
          issueDataHash || ethers.constants.HashZero,
          expiryTs,
          signature,
        ],
      });
      return `Credential issued!\nTx Hash: ${tx.txHash}`;
    });

  const handleCheckIssuer = () =>
    exec(async () => {
      const res = await wallet.readContract(
        contracts!.IssuerRegistry,
        ISSUER_REGISTRY_ABI,
        'isTrustedIssuer',
        [issuerAddr, issuerCredType]
      ) as any;
      const ok = res[0] ?? res;
      const label = CREDENTIAL_TYPES.find((c) => c.hash === issuerCredType)?.label ?? issuerCredType;
      return `${issuerAddr} is ${ok ? '' : 'NOT '}a trusted issuer for ${label}`;
    });

  const handleDashboard = async () => {
    if (!dashboardAddr) return;
    const statuses: CredentialStatus[] = CREDENTIAL_TYPES.map((c) => ({
      type: c.label,
      verified: null,
      loading: true,
    }));
    setDashboard(statuses);
    setError(null);
    setResult(null);

    const updated = await Promise.all(
      CREDENTIAL_TYPES.map(async (c, i) => {
        try {
          const res = await wallet.readContract(
            contracts!.Facade,
            FACADE_ABI,
            'verify',
            [dashboardAddr, c.hash]
          ) as any;
          const ok = res[0] ?? res;
          return { ...statuses[i], verified: !!ok, loading: false };
        } catch {
          return { ...statuses[i], verified: false, loading: false };
        }
      })
    );
    setDashboard(updated);
  };

  return (
    <div>
      <h2>Credentials</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Issue, verify, and view on-chain verifiable credentials (Polygon Mainnet).
      </p>

      {wrongChain && (
        <div className="result-box result-error" style={{ marginBottom: 16 }}>
          Contracts are deployed on chains {IDENTITY_CHAIN_IDS.join(', ')}. Current chain: {wallet.currentChainId}.
        </div>
      )}

      {/* Credential Dashboard */}
      <fieldset className="identity-fieldset">
        <legend>Credential Dashboard</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Wallet Address</label>
            <input
              type="text"
              value={dashboardAddr}
              onChange={(e) => setDashboardAddr(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleDashboard} disabled={wrongChain || !dashboardAddr}>
              Check All
            </button>
          </div>
        </div>
        {dashboard.length > 0 && (
          <div className="cred-grid">
            {dashboard.map((s) => (
              <div key={s.type} className={`cred-pill ${s.loading ? 'cred-loading' : s.verified ? 'cred-pass' : 'cred-fail'}`}>
                <span className="cred-pill-label">{s.type}</span>
                <span>{s.loading ? '...' : s.verified ? 'Pass' : 'Fail'}</span>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      {/* Verify Credential */}
      <fieldset className="identity-fieldset">
        <legend>Verify Credential</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Subject Address</label>
            <input type="text" value={verifyAddr} onChange={(e) => setVerifyAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Credential Type</label>
            <select value={verifyType} onChange={(e) => setVerifyType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => (
                <option key={c.hash} value={c.hash}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-secondary" onClick={handleVerify} disabled={loading || wrongChain}>
          Verify
        </button>
      </fieldset>

      {/* View Credential */}
      <fieldset className="identity-fieldset">
        <legend>View Credential</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Subject Address</label>
            <input type="text" value={viewAddr} onChange={(e) => setViewAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Credential Type</label>
            <select value={viewType} onChange={(e) => setViewType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => (
                <option key={c.hash} value={c.hash}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-secondary" onClick={handleViewCredential} disabled={loading || wrongChain}>
          View
        </button>
      </fieldset>

      {/* Issue Credential (Issuer Only) */}
      <fieldset className="identity-fieldset">
        <legend>Issue Credential (Issuer Only)</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Subject DID (bytes32)</label>
            <input type="text" value={issueDID} onChange={(e) => setIssueDID(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Credential Type</label>
            <select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => (
                <option key={c.hash} value={c.hash}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Data Hash (bytes32, optional)</label>
            <input type="text" value={issueDataHash} onChange={(e) => setIssueDataHash(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Expires At</label>
            <input type="datetime-local" value={issueExpiry} onChange={(e) => setIssueExpiry(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleIssue} disabled={loading || wrongChain}>
          {loading ? 'Signing & Issuing...' : 'Issue Credential'}
        </button>
      </fieldset>

      {/* Check Issuer */}
      <fieldset className="identity-fieldset">
        <legend>Check Trusted Issuer</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Issuer Address</label>
            <input type="text" value={issuerAddr} onChange={(e) => setIssuerAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Credential Type</label>
            <select value={issuerCredType} onChange={(e) => setIssuerCredType(e.target.value)}>
              {CREDENTIAL_TYPES.map((c) => (
                <option key={c.hash} value={c.hash}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-secondary" onClick={handleCheckIssuer} disabled={loading || wrongChain}>
          Check
        </button>
      </fieldset>

      {loading && <div className="result-box result-loading">Processing...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
