import { useState, useCallback, useRef } from 'react';
import { KalpMPCWallet } from '@kalpstudio/kalp-mpc-sdk';
import { CreateWallet } from './components/CreateWallet';
import { SendToken } from './components/SendToken';
import { GaslessTransfer } from './components/GaslessTransfer';
import { SignMessage } from './components/SignMessage';
import { WalletBalance } from './components/WalletBalance';
import { IdentityKYCTab } from './components/IdentityKYCTab';
import { DelegationTab } from './components/DelegationTab';
import { ComplianceTab } from './components/ComplianceTab';

type Tab = 'wallet' | 'send' | 'gasless' | 'sign' | 'balance' | 'identity-kyc' | 'delegation' | 'compliance';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [chainId, setChainId] = useState(80002); // Polygon Amoy default
  const [rpcUrl, setRpcUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://wallet-api.kalp.studio');
  const [wallet, setWallet] = useState<KalpMPCWallet | null>(null);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('wallet');
  const walletRef = useRef<KalpMPCWallet | null>(null);

  const initializeSDK = useCallback(() => {
    if (!apiKey) {
      alert('Please enter your API key');
      return;
    }

    const w = new KalpMPCWallet({
      apiKey,
      chainId,
      rpcUrl: rpcUrl || undefined,
      baseUrl: baseUrl || undefined,
    });

    walletRef.current = w;
    setWallet(w);

    // Try to load existing wallet
    w.init().then((loaded) => {
      if (loaded) {
        setConnected(true);
      }
    });
  }, [apiKey, chainId, rpcUrl, baseUrl]);

  const handleWalletCreated = useCallback(() => {
    setConnected(true);
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (walletRef.current) {
      await walletRef.current.disconnect();
    }
    setConnected(false);
  }, []);

  const chains = [
    { id: 80002, name: 'Polygon Amoy' },
    { id: 137, name: 'Polygon Mainnet' },
    { id: 84532, name: 'Base Sepolia' },
    { id: 11155111, name: 'Ethereum Sepolia' },
    { id: 8453, name: 'Base Mainnet' },
    { id: 421614, name: 'Arbitrum Sepolia' },
    { id: 43113, name: 'Avalanche Fuji' },
    { id: 97, name: 'BSC Testnet' },
    { id: 11155420, name: 'OP Sepolia' },
  ];

  return (
    <div className="app">
      <h1>Kalp MPC SDK</h1>
      <p>Multi-Party Computation wallet for signing blockchain transactions</p>

      {/* SDK Configuration */}
      <div className="config-section">
        <h2>SDK Configuration</h2>
        <div className="form-row">
          <div className="form-group">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Kalp API key"
              disabled={!!wallet}
            />
          </div>
          <div className="form-group">
            <label>Chain</label>
            <select
              value={chainId}
              onChange={(e) => setChainId(Number(e.target.value))}
              disabled={!!wallet}
            >
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Base URL (optional)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://wallet-api.kalp.studio"
              disabled={!!wallet}
            />
          </div>
          <div className="form-group">
            <label>Custom RPC URL (optional)</label>
            <input
              type="text"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="Leave empty for default"
              disabled={!!wallet}
            />
          </div>
        </div>
        <div className="actions">
          {!wallet ? (
            <button className="btn-primary" onClick={initializeSDK}>
              Initialize SDK
            </button>
          ) : (
            <>
              <div
                className={`status-bar ${connected ? 'status-connected' : 'status-disconnected'}`}
                style={{ flex: 1 }}
              >
                {connected ? (
                  <>Connected: {wallet.address}</>
                ) : (
                  <>SDK initialized. Create or import a wallet.</>
                )}
              </div>
              <button className="btn-danger" onClick={handleDisconnect}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      {wallet && (
        <>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'wallet' ? 'active' : ''}`}
              onClick={() => setActiveTab('wallet')}
            >
              Wallet
            </button>
            <button
              className={`tab ${activeTab === 'balance' ? 'active' : ''}`}
              onClick={() => setActiveTab('balance')}
              disabled={!connected}
            >
              Balance
            </button>
            <button
              className={`tab ${activeTab === 'send' ? 'active' : ''}`}
              onClick={() => setActiveTab('send')}
              disabled={!connected}
            >
              Send <span className="badge badge-gas">Gas</span>
            </button>
            <button
              className={`tab ${activeTab === 'gasless' ? 'active' : ''}`}
              onClick={() => setActiveTab('gasless')}
              disabled={!connected}
            >
              Transfer <span className="badge badge-gasless">Gasless</span>
            </button>
            <button
              className={`tab ${activeTab === 'sign' ? 'active' : ''}`}
              onClick={() => setActiveTab('sign')}
              disabled={!connected}
            >
              Sign
            </button>
            <button
              className={`tab ${activeTab === 'identity-kyc' ? 'active' : ''}`}
              onClick={() => setActiveTab('identity-kyc')}
              disabled={!connected}
            >
              Identity & KYC
            </button>
            <button
              className={`tab ${activeTab === 'delegation' ? 'active' : ''}`}
              onClick={() => setActiveTab('delegation')}
              disabled={!connected}
            >
              Delegation
            </button>
            <button
              className={`tab ${activeTab === 'compliance' ? 'active' : ''}`}
              onClick={() => setActiveTab('compliance')}
              disabled={!connected}
            >
              Compliance
            </button>
          </div>

          <div className="config-section">
            {activeTab === 'wallet' && (
              <CreateWallet wallet={wallet} onCreated={handleWalletCreated} />
            )}
            {activeTab === 'balance' && connected && <WalletBalance wallet={wallet} />}
            {activeTab === 'send' && connected && <SendToken wallet={wallet} />}
            {activeTab === 'gasless' && connected && <GaslessTransfer wallet={wallet} />}
            {activeTab === 'sign' && connected && <SignMessage wallet={wallet} />}
            {activeTab === 'identity-kyc' && connected && <IdentityKYCTab wallet={wallet} />}
            {activeTab === 'delegation' && connected && <DelegationTab wallet={wallet} />}
            {activeTab === 'compliance' && connected && <ComplianceTab wallet={wallet} />}
          </div>
        </>
      )}
    </div>
  );
}
