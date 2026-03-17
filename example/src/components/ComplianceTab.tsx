import React, { useState } from 'react';
import type { KalpMPCWallet } from '@kalpstudio/kalp-mpc-sdk';
import {
  getIdentityContracts,
  FACADE_ABI,
  CREDENTIAL_TYPES,
  IDENTITY_CHAIN_IDS,
} from '../constants/contracts';

interface Props {
  wallet: KalpMPCWallet;
}

interface ComplianceResult {
  type: string;
  pass: boolean | null;
  loading: boolean;
}

const RWA_TOKEN_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

export function ComplianceTab({ wallet }: Props) {
  // Compliance check
  const [checkAddr, setCheckAddr] = useState('');
  const [senderResults, setSenderResults] = useState<ComplianceResult[]>([]);
  // Recipient check
  const [recipientAddr, setRecipientAddr] = useState('');
  const [recipientResults, setRecipientResults] = useState<ComplianceResult[]>([]);
  // RWA transfer
  const [rwaToken, setRwaToken] = useState('');
  const [rwaTo, setRwaTo] = useState('');
  const [rwaAmount, setRwaAmount] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contracts = getIdentityContracts(wallet.currentChainId);
  const wrongChain = !contracts;

  const checkCompliance = async (
    addr: string,
    setResults: React.Dispatch<React.SetStateAction<ComplianceResult[]>>
  ) => {
    const initial: ComplianceResult[] = CREDENTIAL_TYPES.map((c) => ({
      type: c.label,
      pass: null,
      loading: true,
    }));
    setResults(initial);

    const updated = await Promise.all(
      CREDENTIAL_TYPES.map(async (c, i) => {
        try {
          const res = await wallet.readContract(
            contracts!.Facade,
            FACADE_ABI,
            'verify',
            [addr, c.hash]
          ) as any;
          const ok = res[0] ?? res;
          return { ...initial[i], pass: !!ok, loading: false };
        } catch {
          return { ...initial[i], pass: false, loading: false };
        }
      })
    );
    setResults(updated);
  };

  const handleCheckSender = () => {
    if (checkAddr) checkCompliance(checkAddr, setSenderResults);
  };

  const handleCheckRecipient = () => {
    if (recipientAddr) checkCompliance(recipientAddr, setRecipientResults);
  };

  const handleTransfer = async () => {
    if (!rwaToken || !rwaTo || !rwaAmount) {
      setError('All transfer fields are required');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const tx = await wallet.callContract({
        contractAddress: rwaToken,
        abi: RWA_TOKEN_ABI,
        functionName: 'transfer',
        params: [rwaTo, rwaAmount],
      });
      setResult(`RWA Transfer successful!\nTx Hash: ${tx.txHash}`);
    } catch (e: any) {
      setError(e.message || 'Transfer failed (compliance check may have reverted)');
    } finally {
      setLoading(false);
    }
  };

  const ComplianceGrid = ({ results, label }: { results: ComplianceResult[]; label: string }) => {
    if (results.length === 0) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <div className="cred-grid" style={{ marginTop: 6 }}>
          {results.map((r) => (
            <div
              key={r.type}
              className={`cred-pill ${r.loading ? 'cred-loading' : r.pass ? 'cred-pass' : 'cred-fail'}`}
            >
              <span className="cred-pill-label">{r.type}</span>
              <span>{r.loading ? '...' : r.pass ? 'Pass' : 'Fail'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2>RWA Compliance</h2>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
        Check credential compliance for RWA token transfers (Polygon Mainnet).
      </p>

      {wrongChain && (
        <div className="result-box result-error" style={{ marginBottom: 16 }}>
          Contracts are deployed on chains {IDENTITY_CHAIN_IDS.join(', ')}. Current chain: {wallet.currentChainId}.
        </div>
      )}

      {/* Compliance Status Grid */}
      <fieldset className="identity-fieldset">
        <legend>Compliance Check</legend>
        <div className="form-row">
          <div className="form-group">
            <label>Sender Address</label>
            <input type="text" value={checkAddr} onChange={(e) => setCheckAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleCheckSender} disabled={wrongChain || !checkAddr}>
              Check Sender
            </button>
          </div>
        </div>
        <ComplianceGrid results={senderResults} label="Sender Credentials" />

        <div className="form-row" style={{ marginTop: 16 }}>
          <div className="form-group">
            <label>Recipient Address</label>
            <input type="text" value={recipientAddr} onChange={(e) => setRecipientAddr(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleCheckRecipient} disabled={wrongChain || !recipientAddr}>
              Check Recipient
            </button>
          </div>
        </div>
        <ComplianceGrid results={recipientResults} label="Recipient Credentials" />
      </fieldset>

      {/* RWA Token Transfer */}
      <fieldset className="identity-fieldset">
        <legend>RWA Token Transfer</legend>
        <p style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>
          Transfer an RWA token. The token contract calls <code>facade.verify()</code> on-chain
          to gate transfers — if either party lacks required credentials the transaction will revert.
        </p>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>RWA Token Contract Address</label>
          <input type="text" value={rwaToken} onChange={(e) => setRwaToken(e.target.value)} placeholder="0x..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Recipient Address</label>
            <input type="text" value={rwaTo} onChange={(e) => setRwaTo(e.target.value)} placeholder="0x..." />
          </div>
          <div className="form-group">
            <label>Amount (raw units)</label>
            <input type="text" value={rwaAmount} onChange={(e) => setRwaAmount(e.target.value)} placeholder="1000000000000000000" />
          </div>
        </div>
        <button className="btn-primary" onClick={handleTransfer} disabled={loading || wrongChain}>
          {loading ? 'Signing & Broadcasting...' : 'Transfer RWA Token'}
        </button>
      </fieldset>

      {/* How It Works */}
      <fieldset className="identity-fieldset">
        <legend>How RWA Compliance Works</legend>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7 }}>
          <p><strong>1.</strong> The ExampleRWAToken contract overrides <code>_beforeTokenTransfer</code>.</p>
          <p><strong>2.</strong> On every transfer it calls <code>facade.verify(sender, KYC_AML)</code> and <code>facade.verify(recipient, KYC_AML)</code>.</p>
          <p><strong>3.</strong> The Facade contract checks the CredentialRegistry for a valid, non-expired, non-revoked credential.</p>
          <p><strong>4.</strong> If either party fails verification, the transfer reverts with a compliance error.</p>
          <p style={{ marginTop: 8 }}>This ensures that only KYC-verified wallets can hold and transfer real-world asset tokens.</p>
        </div>
      </fieldset>

      {loading && <div className="result-box result-loading">Processing on-chain...</div>}
      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line' }}>{result}</div>}
      {error && <div className="result-box result-error">{error}</div>}
    </div>
  );
}
