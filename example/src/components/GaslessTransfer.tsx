import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
}

export function GaslessTransfer({ wallet }: Props) {
  const [tokenAddress, setTokenAddress] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [feeAmount, setFeeAmount] = useState('1');
  const [decimals, setDecimals] = useState(18);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!tokenAddress || !to || !amount) {
      setError('Token address, recipient, and amount are required');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await wallet.sendGaslessTransfer({
        tokenAddress,
        to,
        amount,
        decimals,
        feeAmount: feeAmount || undefined,
      });
      setResult(
        `Gasless transfer complete!\nTx Hash: ${res.txHash}${
          res.blockNumber ? `\nBlock: ${res.blockNumber}` : ''
        }${res.gasUsed ? `\nGas Used: ${res.gasUsed}` : ''}`
      );
    } catch (e: any) {
      setError(e.message || 'Gasless transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Gasless Transfer <span className="badge badge-gasless">No Gas Required</span></h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Token transfer via ERC-2771 relay. Uses EIP-2612 permit + EIP-712 intent signatures.
        A platform fee is deducted from the token amount.
      </p>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Token Contract Address (must support EIP-2612 permit)</label>
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

      <div className="form-row">
        <div className="form-group">
          <label>Platform Fee (tokens, default: 1)</label>
          <input
            type="text"
            value={feeAmount}
            onChange={(e) => setFeeAmount(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="form-group">
          <label>Token Decimals</label>
          <input
            type="number"
            value={decimals}
            onChange={(e) => setDecimals(Number(e.target.value))}
          />
        </div>
      </div>

      <button className="btn-primary" onClick={handleSend} disabled={loading}>
        {loading ? 'Signing & Relaying...' : 'Send Gasless Transfer'}
      </button>

      {loading && (
        <div className="result-box result-loading">
          MPC signing permit + intent + relay request...
        </div>
      )}
      {result && (
        <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>
          {result}
        </div>
      )}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
