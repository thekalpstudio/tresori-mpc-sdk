import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalpstudio/kalp-mpc-sdk';
import {
  getIdentityContracts,
  DELEGATION_MANAGER_ABI,
  PERMISSIONS,
  IDENTITY_CHAIN_IDS,
} from '../constants/contracts';

interface Props {
  wallet: KalpMPCWallet;
}

const MAX_EXPIRY_DAYS = 90;

export function DelegationTab({ wallet }: Props) {
  // Create Agent DID
  const [agentPrincipalDID, setAgentPrincipalDID] = useState('');
  const [agentAddress, setAgentAddress] = useState('');
  // Grant permission
  const [grantDID, setGrantDID] = useState('');
  const [grantAgent, setGrantAgent] = useState('');
  const [grantPerm, setGrantPerm] = useState(PERMISSIONS[0].hash);
  const [grantExpiry, setGrantExpiry] = useState('');
  // Revoke permission
  const [revokeDID, setRevokeDID] = useState('');
  const [revokeAgent, setRevokeAgent] = useState('');
  const [revokePerm, setRevokePerm] = useState(PERMISSIONS[0].hash);
  // Check permission
  const [checkDID, setCheckDID] = useState('');
  const [checkAgent, setCheckAgent] = useState('');
  const [checkPerm, setCheckPerm] = useState(PERMISSIONS[0].hash);
  // View delegation
  const [viewAgent, setViewAgent] = useState('');
  const [viewPrincipal, setViewPrincipal] = useState('');
  const [viewPerm, setViewPerm] = useState(PERMISSIONS[0].hash);

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

  const handleCreateAgent = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.DelegationManager,
        abi: DELEGATION_MANAGER_ABI,
        functionName: 'createAgentDID',
        params: [agentPrincipalDID, agentAddress],
      });
      return `Agent DID created!\nTx Hash: ${tx.txHash}`;
    });

  const handleGrant = () =>
    exec(async () => {
      const expiryTs = Math.floor(new Date(grantExpiry).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      const maxTs = now + MAX_EXPIRY_DAYS * 86400;
      if (expiryTs > maxTs) {
        throw new Error(`Expiry cannot exceed ${MAX_EXPIRY_DAYS} days from now`);
      }
      const tx = await wallet.callContract({
        contractAddress: contracts!.DelegationManager,
        abi: DELEGATION_MANAGER_ABI,
        functionName: 'grantPermission',
        params: [grantDID, grantAgent, grantPerm, expiryTs],
      });
      return `Permission granted!\nTx Hash: ${tx.txHash}`;
    });

  const handleRevoke = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.DelegationManager,
        abi: DELEGATION_MANAGER_ABI,
        functionName: 'revokePermission',
        params: [revokeDID, revokeAgent, revokePerm],
      });
      return `Permission revoked!\nTx Hash: ${tx.txHash}`;
    });

  const handleCheck = () =>
    exec(async () => {
      const res = await wallet.readContract(
        contracts!.DelegationManager,
        DELEGATION_MANAGER_ABI,
        'isControllerView',
        [checkDID, checkAgent, checkPerm]
      ) as any;
      const ok = res[0] ?? res;
      const label = PERMISSIONS.find((p) => p.hash === checkPerm)?.label ?? checkPerm;
      return `${checkAgent} ${ok ? 'HAS' : 'DOES NOT HAVE'} "${label}" permission for DID ${checkDID}`;
    });

  const handleViewDelegation = () =>
    exec(async () => {
      const rawRes = await wallet.readContract(
        contracts!.DelegationManager,
        DELEGATION_MANAGER_ABI,
        'getDelegation',
        [viewAgent, viewPrincipal, viewPerm]
      ) as any;
      const res = rawRes[0] ?? rawRes;
      const granted = res.granted ?? res[0];
      const expiresAt = res.expiresAt ?? res[3];
      const revoked = res.revoked ?? res[4];
      const label = PERMISSIONS.find((p) => p.hash === viewPerm)?.label ?? viewPerm;
      return [
        `Permission: ${label}`,
        `Granted: ${granted}`,
        `Expires: ${new Date(Number(expiresAt) * 1000).toLocaleString()}`,
        `Revoked: ${revoked}`,
      ].join('\n');
    });

  const PermSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {PERMISSIONS.map((p) => (
        <option key={p.hash} value={p.hash}>{p.label}</option>
      ))}
    </select>
  );

  return (
    <div>
      <h2>Delegation</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Manage agent DIDs and delegate permissions (Polygon Mainnet).
      </p>

      {wrongChain && (
        <div className="result-box result-error" style={{ marginBottom: 16 }}>
          Contracts are deployed on chains {IDENTITY_CHAIN_IDS.join(', ')}. Current chain: {wallet.currentChainId}.
        </div>
      )}

      {/* Create Agent DID */}
      <fieldset className="identity-fieldset">
        <legend>Create Agent DID</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Principal DID (bytes32)</label>
            <input type="text" value={agentPrincipalDID} onChange={(e) => setAgentPrincipalDID(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Agent Address</label>
            <input type="text" value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <button className="btn-primary" onClick={handleCreateAgent} disabled={loading || wrongChain}>
          Create Agent DID
        </button>
      </fieldset>

      {/* Grant Permission */}
      <fieldset className="identity-fieldset">
        <legend>Grant Permission</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Principal DID (bytes32)</label>
            <input type="text" value={grantDID} onChange={(e) => setGrantDID(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Agent Address</label>
            <input type="text" value={grantAgent} onChange={(e) => setGrantAgent(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Permission</label>
            <PermSelect value={grantPerm} onChange={setGrantPerm} />
          </div>
          <div className="form-group">
            <label>Expires At (max {MAX_EXPIRY_DAYS} days)</label>
            <input type="datetime-local" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleGrant} disabled={loading || wrongChain}>
          Grant
        </button>
      </fieldset>

      {/* Revoke Permission */}
      <fieldset className="identity-fieldset">
        <legend>Revoke Permission</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Principal DID (bytes32)</label>
            <input type="text" value={revokeDID} onChange={(e) => setRevokeDID(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Agent Address</label>
            <input type="text" value={revokeAgent} onChange={(e) => setRevokeAgent(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12, maxWidth: 300 }}>
          <label>Permission</label>
          <PermSelect value={revokePerm} onChange={setRevokePerm} />
        </div>
        <button className="btn-danger" onClick={handleRevoke} disabled={loading || wrongChain}>
          Revoke
        </button>
      </fieldset>

      {/* Check Permission */}
      <fieldset className="identity-fieldset">
        <legend>Check Permission</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Principal DID (bytes32)</label>
            <input type="text" value={checkDID} onChange={(e) => setCheckDID(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Agent Address</label>
            <input type="text" value={checkAgent} onChange={(e) => setCheckAgent(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12, maxWidth: 300 }}>
          <label>Permission</label>
          <PermSelect value={checkPerm} onChange={setCheckPerm} />
        </div>
        <button className="btn-secondary" onClick={handleCheck} disabled={loading || wrongChain}>
          Check
        </button>
      </fieldset>

      {/* View Delegation */}
      <fieldset className="identity-fieldset">
        <legend>View Delegation</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Agent Address</label>
            <input type="text" value={viewAgent} onChange={(e) => setViewAgent(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Principal DID (bytes32)</label>
            <input type="text" value={viewPrincipal} onChange={(e) => setViewPrincipal(e.target.value)} placeholder="0x..." />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12, maxWidth: 300 }}>
          <label>Permission</label>
          <PermSelect value={viewPerm} onChange={setViewPerm} />
        </div>
        <button className="btn-secondary" onClick={handleViewDelegation} disabled={loading || wrongChain}>
          View
        </button>
      </fieldset>

      {loading && <div className="result-box result-loading">Processing on-chain...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
