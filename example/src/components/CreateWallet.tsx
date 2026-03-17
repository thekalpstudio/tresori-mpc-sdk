import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalpstudio/kalp-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
  onCreated: () => void;
}

export function CreateWallet({ wallet, onCreated }: Props) {
  const [userId, setUserId] = useState('');
  const [importAddress, setImportAddress] = useState('');
  const [importSession, setImportSession] = useState('');
  const [importShare, setImportShare] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'import'>('create');

  const handleCreate = async () => {
    if (!userId) {
      setError('Please enter a user ID');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const info = await wallet.createWallet(userId);
      setResult(`Wallet created!\nAddress: ${info.address}\nSession: ${info.sessionId}\nChain: ${info.chainId}`);
      onCreated();
    } catch (e: any) {
      setError(e.message || 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importAddress || !importSession || !importShare) {
      setError('All fields are required for import');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      await wallet.importWallet(importAddress, importSession, importShare);
      setResult(`Wallet imported!\nAddress: ${importAddress}`);
      onCreated();
    } catch (e: any) {
      setError(e.message || 'Failed to import wallet');
    } finally {
      setLoading(false);
    }
  };

  if (wallet.isInitialized) {
    return (
      <div>
        <h2>Wallet Connected</h2>
        <div className="wallet-info">
          <p><strong>Address:</strong> {wallet.address}</p>
          <p><strong>Session ID:</strong> {wallet.sessionId}</p>
          <p><strong>Chain ID:</strong> {wallet.currentChainId}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Setup Wallet</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={mode === 'create' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setMode('create')}
        >
          Create New
        </button>
        <button
          className={mode === 'import' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setMode('import')}
        >
          Import Existing
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>User ID (email or identifier)</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating wallet (DKG)...' : 'Create MPC Wallet'}
          </button>
        </>
      ) : (
        <>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Wallet Address</label>
            <input
              type="text"
              value={importAddress}
              onChange={(e) => setImportAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Session ID</label>
            <input
              type="text"
              value={importSession}
              onChange={(e) => setImportSession(e.target.value)}
              placeholder="Session ID from DKG"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Client Share (hex)</label>
            <input
              type="password"
              value={importShare}
              onChange={(e) => setImportShare(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <button className="btn-primary" onClick={handleImport} disabled={loading}>
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
        </>
      )}

      {loading && <div className="result-box result-loading">Processing...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
