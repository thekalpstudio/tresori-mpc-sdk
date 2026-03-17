import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';
import {
  getIdentityContracts,
  IDENTITY_REGISTRY_ABI,
  IDENTITY_CHAIN_IDS,
} from '../constants/contracts';

interface Props {
  wallet: KalpMPCWallet;
}

const STATUS_LABELS: Record<number, { text: string; className: string }> = {
  0: { text: 'Active', className: 'status-pill-active' },
  1: { text: 'Suspended', className: 'status-pill-suspended' },
  2: { text: 'Revoked', className: 'status-pill-revoked' },
};

export function IdentityTab({ wallet }: Props) {
  // Create identity
  const [metadataURI, setMetadataURI] = useState('');
  // Resolve / View
  const [resolveAddr, setResolveAddr] = useState('');
  const [viewDID, setViewDID] = useState('');
  // Update metadata
  const [updateDID, setUpdateDID] = useState('');
  const [newMetadata, setNewMetadata] = useState('');
  // Add / Remove controller
  const [ctrlDID, setCtrlDID] = useState('');
  const [ctrlAddr, setCtrlAddr] = useState('');

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

  const handleCreateIdentity = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'createIdentity',
        params: [metadataURI || ''],
      });
      return `Identity created!\nTx Hash: ${tx.txHash}`;
    });

  const handleResolve = () =>
    exec(async () => {
      const res = await wallet.readContract(
        contracts!.IdentityRegistry,
        IDENTITY_REGISTRY_ABI,
        'resolveDID',
        [resolveAddr]
      ) as any;
      const did = res[0] ?? res;
      return `DID for ${resolveAddr}:\n${did}`;
    });

  const handleViewIdentity = () =>
    exec(async () => {
      const rawRes = await wallet.readContract(
        contracts!.IdentityRegistry,
        IDENTITY_REGISTRY_ABI,
        'getIdentity',
        [viewDID]
      ) as any;
      const ident = rawRes[0] ?? rawRes;
      const owner = ident.owner ?? ident[1];
      const status = ident.status ?? ident[4];
      const controllers = ident.controllers ?? ident[2] ?? [];
      const metadata = ident.metadataURI ?? ident[3];
      const createdAt = ident.createdAt ?? ident[5];
      const updatedAt = ident.updatedAt ?? ident[6];
      const statusInfo = STATUS_LABELS[Number(status)] || { text: `Unknown (${status})`, className: '' };
      const created = new Date(Number(createdAt) * 1000).toLocaleString();
      const updated = new Date(Number(updatedAt) * 1000).toLocaleString();
      return [
        `Owner: ${owner}`,
        `Status: ${statusInfo.text}`,
        `Metadata URI: ${metadata}`,
        `Controllers: ${(controllers as string[]).join(', ') || 'none'}`,
        `Created: ${created}`,
        `Updated: ${updated}`,
      ].join('\n');
    });

  const handleUpdateMetadata = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'updateMetadata',
        params: [updateDID, newMetadata],
      });
      return `Metadata updated!\nTx Hash: ${tx.txHash}`;
    });

  const handleAddController = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'addController',
        params: [ctrlDID, ctrlAddr],
      });
      return `Controller added!\nTx Hash: ${tx.txHash}`;
    });

  const handleRemoveController = () =>
    exec(async () => {
      const tx = await wallet.callContract({
        contractAddress: contracts!.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'removeController',
        params: [ctrlDID, ctrlAddr],
      });
      return `Controller removed!\nTx Hash: ${tx.txHash}`;
    });

  return (
    <div>
      <h2>Identity (DID)</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Create and manage on-chain decentralized identities on Polygon Mainnet.
      </p>

      {wrongChain && (
        <div className="result-box result-error" style={{ marginBottom: 16 }}>
          Identity contracts are deployed on chains {IDENTITY_CHAIN_IDS.join(', ')}. Current chain: {wallet.currentChainId}.
          Please switch to a supported chain.
        </div>
      )}

      {/* Create Identity */}
      <fieldset className="identity-fieldset">
        <legend>Create Identity</legend>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Metadata URI (optional)</label>
          <input
            type="text"
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            placeholder="ipfs://... or https://..."
          />
        </div>
        <button className="btn-primary" onClick={handleCreateIdentity} disabled={loading || wrongChain}>
          {loading ? 'Processing...' : 'Create Identity'}
        </button>
      </fieldset>

      {/* Resolve DID */}
      <fieldset className="identity-fieldset">
        <legend>Resolve DID</legend>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Wallet Address</label>
          <input
            type="text"
            value={resolveAddr}
            onChange={(e) => setResolveAddr(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <button className="btn-secondary" onClick={handleResolve} disabled={loading || wrongChain}>
          Resolve
        </button>
      </fieldset>

      {/* View Identity */}
      <fieldset className="identity-fieldset">
        <legend>View Identity</legend>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>DID (bytes32)</label>
          <input
            type="text"
            value={viewDID}
            onChange={(e) => setViewDID(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <button className="btn-secondary" onClick={handleViewIdentity} disabled={loading || wrongChain}>
          View
        </button>
      </fieldset>

      {/* Update Metadata */}
      <fieldset className="identity-fieldset">
        <legend>Update Metadata</legend>
        <div className="form-row">
          <div className="form-group">
            <label>DID (bytes32)</label>
            <input
              type="text"
              value={updateDID}
              onChange={(e) => setUpdateDID(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="form-group">
            <label>New Metadata URI</label>
            <input
              type="text"
              value={newMetadata}
              onChange={(e) => setNewMetadata(e.target.value)}
              placeholder="ipfs://..."
            />
          </div>
        </div>
        <button className="btn-primary" onClick={handleUpdateMetadata} disabled={loading || wrongChain}>
          Update
        </button>
      </fieldset>

      {/* Add / Remove Controller */}
      <fieldset className="identity-fieldset">
        <legend>Add / Remove Controller</legend>
        <div className="form-row">
          <div className="form-group">
            <label>DID (bytes32)</label>
            <input
              type="text"
              value={ctrlDID}
              onChange={(e) => setCtrlDID(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="form-group">
            <label>Controller Address</label>
            <input
              type="text"
              value={ctrlAddr}
              onChange={(e) => setCtrlAddr(e.target.value)}
              placeholder="0x..."
            />
          </div>
        </div>
        <div className="actions">
          <button className="btn-primary" onClick={handleAddController} disabled={loading || wrongChain}>
            Add Controller
          </button>
          <button className="btn-danger" onClick={handleRemoveController} disabled={loading || wrongChain}>
            Remove Controller
          </button>
        </div>
      </fieldset>

      {loading && <div className="result-box result-loading">Processing on-chain...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
