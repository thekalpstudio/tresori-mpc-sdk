import React, { useState, useEffect } from 'react';
import type { KalpMPCWallet } from '@kalpstudio/kalp-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
}

export function WalletBalance({ wallet }: Props) {
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNativeBalance();
  }, []);

  const fetchNativeBalance = async () => {
    try {
      const balance = await wallet.getBalance();
      setNativeBalance(balance);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const fetchTokenBalance = async () => {
    if (!tokenAddress) {
      setError('Enter a token address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const balance = await wallet.getTokenBalance(tokenAddress, tokenDecimals);
      setTokenBalance(balance);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Wallet Balance</h2>

      <div className="wallet-info" style={{ marginBottom: 16 }}>
        <p><strong>Address:</strong> {wallet.address}</p>
        <p><strong>Chain ID:</strong> {wallet.currentChainId}</p>
        <p>
          <strong>Native Balance:</strong>{' '}
          {nativeBalance !== null ? `${nativeBalance} ETH` : 'Loading...'}
          <button
            className="btn-secondary"
            onClick={fetchNativeBalance}
            style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12 }}
          >
            Refresh
          </button>
        </p>
      </div>

      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Token Balance</h3>

      <div className="form-row">
        <div className="form-group">
          <label>Token Contract Address</label>
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <div className="form-group">
          <label>Decimals</label>
          <input
            type="number"
            value={tokenDecimals}
            onChange={(e) => setTokenDecimals(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="actions">
        <button className="btn-primary" onClick={fetchTokenBalance} disabled={loading}>
          {loading ? 'Fetching...' : 'Get Token Balance'}
        </button>
      </div>

      {tokenBalance !== null && (
        <div className="result-box result-success">Token Balance: {tokenBalance}</div>
      )}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
