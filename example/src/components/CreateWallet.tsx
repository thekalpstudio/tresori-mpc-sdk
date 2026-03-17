import React, { useState, useEffect, useRef } from 'react';
import type { KalpMPCWallet } from '@kalp_studio/tresori-mpc-sdk';

interface Props {
  wallet: KalpMPCWallet;
  onCreated: () => void;
}

type Mode = 'email' | 'import';
type Step = 'input' | 'otp' | 'creating';

const OTP_LENGTH = 4;
const RESEND_TIMER = 60;

export function CreateWallet({ wallet, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('email');

  // Email OTP flow
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [isNewWallet, setIsNewWallet] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Import flow
  const [importAddress, setImportAddress] = useState('');
  const [importSession, setImportSession] = useState('');
  const [importShare, setImportShare] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  const clearMsg = () => { setResult(null); setError(null); };

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    clearMsg();
    try {
      const res = await wallet.sendEmailOtp(email);
      setIsNewWallet(res.isNewWallet);
      setStep('otp');
      setResendTimer(RESEND_TIMER);
      setOtp(['', '', '', '']);
      setResult(res.message || 'OTP sent to your email');
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──
  const handleResend = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    clearMsg();
    try {
      const res = await wallet.sendEmailOtp(email);
      setResendTimer(RESEND_TIMER);
      setOtp(['', '', '', '']);
      setResult(res.message || 'OTP resent');
    } catch (e: any) {
      setError(e.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP Input Handling ──
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  };

  // ── Verify OTP ──
  const handleVerifyOtp = async () => {
    const otpStr = otp.join('');
    if (otpStr.length !== OTP_LENGTH) {
      setError('Please enter the complete OTP');
      return;
    }
    setLoading(true);
    setStep('creating');
    clearMsg();
    try {
      const info = await wallet.verifyEmailOtp(email, otpStr);
      setResult(
        `${isNewWallet ? 'Wallet created' : 'Wallet connected'}!\nAddress: ${info.address}`
      );
      onCreated();
    } catch (e: any) {
      setError(e.message || 'OTP verification failed');
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  // ── Import ──
  const handleImport = async () => {
    if (!importAddress || !importSession || !importShare) {
      setError('All fields are required for import');
      return;
    }
    setLoading(true);
    clearMsg();
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

  // ── Back to email input ──
  const handleBack = () => {
    setStep('input');
    clearMsg();
    setOtp(['', '', '', '']);
  };

  // ── Already connected ──
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
          className={mode === 'email' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => { setMode('email'); clearMsg(); setStep('input'); }}
        >
          Email Login
        </button>
        <button
          className={mode === 'import' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => { setMode('import'); clearMsg(); }}
        >
          Import Existing
        </button>
      </div>

      {mode === 'email' && step === 'input' && (
        <>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            Enter your email to receive a one-time verification code.
            If you already have a wallet, it will be loaded automatically.
            Otherwise, a new MPC wallet will be created.
          </p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
            />
          </div>
          <button className="btn-primary" onClick={handleSendOtp} disabled={loading}>
            {loading ? 'Sending OTP...' : 'Send Verification Code'}
          </button>
        </>
      )}

      {mode === 'email' && step === 'otp' && (
        <>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
            Enter the 4-digit code sent to <strong>{email}</strong>
          </p>
          {isNewWallet && (
            <p style={{ color: '#3826fd', fontSize: 12, marginBottom: 12 }}>
              No existing wallet found — a new MPC wallet will be created after verification.
            </p>
          )}

          <div className="otp-container" style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'center' }}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                className="otp-input"
                style={{
                  width: 52,
                  height: 56,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  borderRadius: 10,
                  border: '2px solid #ddd',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3826fd'; }}
                onBlur={(e) => { e.target.style.borderColor = '#ddd'; }}
              />
            ))}
          </div>

          <div className="actions">
            <button
              className="btn-primary"
              onClick={handleVerifyOtp}
              disabled={loading || otp.join('').length !== OTP_LENGTH}
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <button className="btn-secondary" onClick={handleBack} disabled={loading}>
              Back
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: '#888' }}>
            {resendTimer > 0 ? (
              <span>Resend code in {resendTimer}s</span>
            ) : (
              <button
                style={{ background: 'none', border: 'none', color: '#3826fd', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}
                onClick={handleResend}
                disabled={loading}
              >
                Resend Code
              </button>
            )}
          </div>
        </>
      )}

      {mode === 'email' && step === 'creating' && (
        <div className="result-box result-loading" style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            {isNewWallet ? 'Creating your MPC wallet...' : 'Loading your wallet...'}
          </p>
          <p style={{ fontSize: 12 }}>
            {isNewWallet
              ? 'Running Distributed Key Generation protocol. This may take a few seconds.'
              : 'Restoring wallet from server...'}
          </p>
        </div>
      )}

      {mode === 'import' && (
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

      {result && <div className="result-box result-success" style={{ whiteSpace: 'pre-line', marginTop: 12 }}>{result}</div>}
      {error && <div className="result-box result-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
