import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
}

export function SendToken({ wallet }: Props) {
  const [tokenAddress, setTokenAddress] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [decimals, setDecimals] = useState(18);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!tokenAddress || !to || !amount) {
      setError('All fields are required');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await wallet.sendTokenTransfer({
        tokenAddress,
        to,
        amount,
        decimals,
      });
      setResult(`Transaction sent!\nTx Hash: ${res.txHash}`);
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Send Token <span className="badge badge-gas">User Pays Gas</span></h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        MPC-signed ERC-20 token transfer. The user's wallet pays gas fees.
      </p>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Token Contract Address</label>
        <input
          type="text"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          placeholder="0x..."
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Recipient Address</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x..."
          />
        </div>
        <div className="form-group">
          <label>Amount</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.5"
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 12, maxWidth: 200 }}>
        <label>Token Decimals</label>
        <input
          type="number"
          value={decimals}
          onChange={(e) => setDecimals(Number(e.target.value))}
        />
      </div>

      <button className="btn-primary" onClick={handleSend} disabled={loading}>
        {loading ? 'Signing & Broadcasting...' : 'Send Token'}
      </button>

      {loading && <div className="result-box result-loading">MPC signing in progress...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
