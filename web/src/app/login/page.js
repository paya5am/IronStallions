'use client';
// Two-step login:
//  1. phone number -> SMS code (shown on screen in the demo)
//  2a. known device -> "Confirm on this device" (stands in for fingerprint / face unlock)
//  2b. new device   -> email code, then this browser is registered as a device
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/ui';

const deviceKey = (phone) => `gym_device_${phone}`;
const readDevice = (phone) => { try { return localStorage.getItem(deviceKey(phone)); } catch { return null; } };
const saveDevice = (phone, id) => { try { localStorage.setItem(deviceKey(phone), id); } catch { /* private mode */ } };
const forgetDevice = (phone) => { try { localStorage.removeItem(deviceKey(phone)); } catch { /* ignore */ } };

function browserName() {
  if (typeof navigator === 'undefined') return 'Web browser';
  const ua = navigator.userAgent;
  const os = /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${br} on ${os}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('PHONE');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const requestSms = (e) => { e?.preventDefault(); go(async () => {
    const r = await api.post('/api/auth/request-otp', { phone });
    setInfo({ sentTo: r.sentTo, demoOtp: r.demoOtp }); setCode(''); setStep('SMS');
  }); };

  const verifySms = (e) => { e.preventDefault(); go(async () => {
    const r = await api.post('/api/auth/verify-otp', { phone, otp: code, deviceId: readDevice(phone) });
    setInfo(r); setCode(''); setStep(r.step);
  }); };

  const finish = (r) => router.replace(r.home);

  const confirmDevice = () => go(async () => {
    const r = await api.post('/api/auth/confirm-device', { challengeId: info.challengeId, deviceId: readDevice(phone) });
    finish(r);
  });

  const verifyEmail = (e) => { e.preventDefault(); go(async () => {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    const r = await api.post('/api/auth/verify-email', { challengeId: info.challengeId, otp: code, deviceName: browserName(), publicKey: 'demo-' + key });
    saveDevice(phone, r.deviceId);
    finish(r);
  }); };

  const restart = () => { setStep('PHONE'); setInfo({}); setCode(''); setError(''); };
  const stepIndex = { PHONE: 0, SMS: 1, CONFIRM_DEVICE: 2, EMAIL_OTP: 2 }[step];

  return (
    <div className="loginwrap">
      <div className="loginbox">
        <h1>IronStallions</h1>
        <div className="muted">Sign in with your phone number</div>
        <div className="steps">{[0, 1, 2].map((i) => <span key={i} className={i <= stepIndex ? 'on' : ''} />)}</div>

        {error && <div className="alert bad">{error}</div>}

        {step === 'PHONE' && (
          <form onSubmit={requestSms}>
            <label className="field">Phone number
              <input inputMode="numeric" autoFocus placeholder="10-digit mobile number" value={phone}
                     onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </label>
            <button className="primary" disabled={busy || phone.length !== 10}>Send code</button>
            <p className="small muted" style={{ marginTop: 14 }}>No passwords. A one-time code is sent by SMS, then your registered phone confirms it is you.</p>
          </form>
        )}

        {step === 'SMS' && (
          <form onSubmit={verifySms}>
            <label className="field">Code sent by SMS to {info.sentTo}
              <input inputMode="numeric" autoFocus placeholder="6-digit code" value={code}
                     onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            {info.demoOtp && <div className="otpdemo">Demo mode (no SMS gateway): your code is <b>{info.demoOtp}</b></div>}
            <button className="primary" disabled={busy || code.length !== 6}>Verify</button>
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="ghost small" onClick={requestSms} disabled={busy}>Resend</button>
              <button type="button" className="ghost small" onClick={restart}>Change number</button>
            </div>
          </form>
        )}

        {step === 'CONFIRM_DEVICE' && (
          <div>
            <p>Welcome back, <b>{info.name}</b>.</p>
            <p className="muted small">Approve this login on your registered device ({info.deviceName}). In the real app this is a fingerprint or face unlock.</p>
            <button className="primary" onClick={confirmDevice} disabled={busy}>Confirm on this device</button>
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="ghost small" onClick={() => { forgetDevice(phone); restart(); }}>Use a different device</button>
            </div>
          </div>
        )}

        {step === 'EMAIL_OTP' && (
          <form onSubmit={verifyEmail}>
            <p>Hi <b>{info.name}</b>, this browser is not registered yet.</p>
            <label className="field">Code sent to your email {info.sentTo}
              <input inputMode="numeric" autoFocus placeholder="6-digit code" value={code}
                     onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            {info.demoOtp && <div className="otpdemo">Demo mode (no email server): your code is <b>{info.demoOtp}</b></div>}
            <button className="primary" disabled={busy || code.length !== 6}>Register this device and sign in</button>
            <button type="button" className="ghost small" onClick={restart}>Start again</button>
          </form>
        )}
      </div>
    </div>
  );
}
