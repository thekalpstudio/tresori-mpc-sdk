import React, { useState } from 'react';
import { ethers } from 'ethers';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
}

export function SignMessage({ wallet }: Props) {
  const [message, setMessage] = useState('Hello from Kalp MPC SDK!');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    if (!message) {
      setError('Please enter a message');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const hash = ethers.utils.hashMessage(message);
      const sig = await wallet.signMessage(hash);
      setResult(
        `Message signed!\n\nMessage: ${message}\nHash: ${hash}\n\nSignature:\n  r: ${sig.r}\n  s: ${sig.s}\n  v: ${sig.v}`
      );
    } catch (e: any) {
      setError(e.message || 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignTypedData = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const signature = await wallet.signTypedData({
        domain: {
          name: 'Example App',
          version: '1.0.0',
          chainId: wallet.currentChainId,
        },
        types: {
          Message: [
            { name: 'content', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
          ],
        },
        primaryType: 'Message',
        message: {
          content: message,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
      setResult(`EIP-712 Typed Data signed!\n\nSignature: ${signature}`);
    } catch (e: any) {
      setError(e.message || 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Sign Message</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Sign arbitrary messages or EIP-712 typed data using MPC threshold signatures.
      </p>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label>Message</label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hello from Kalp MPC SDK!"
        />
      </div>

      <div className="actions">
        <button className="btn-primary" onClick={handleSign} disabled={loading}>
          {loading ? 'Signing...' : 'Sign Message (raw)'}
        </button>
        <button className="btn-secondary" onClick={handleSignTypedData} disabled={loading}>
          {loading ? 'Signing...' : 'Sign EIP-712 Typed Data'}
        </button>
      </div>

      {loading && <div className="result-box result-loading">MPC signing in progress...</div>}
      {result && (
        <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>
          {result}
        </div>
      )}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
