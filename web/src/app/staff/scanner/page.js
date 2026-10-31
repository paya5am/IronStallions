'use client';
// Front desk QR scanner: camera (laptop webcam) or typed code. Also manual check-in.
import { useEffect, useRef, useState } from 'react';
import { useAction, api, Card, Alert, PageHead } from '@/components/ui';

export default function ScannerPage() {
  const { msg, setMsg, busy, run } = useAction();
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const scanner = useRef(null);
  const lastToken = useRef('');

  const submit = async (token) => {
    if (!token || busy) return;
    await run(() => api.post('/api/staff/checkin', { mode: 'qr', token: token.trim() }));
    setCode('');
  };

  useEffect(() => {
    if (!camera) return undefined;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        const s = new Html5Qrcode('qr-reader');
        scanner.current = s;
        await s.start({ facingMode: 'environment' }, { fps: 8, qrbox: 240 }, (text) => {
          if (text === lastToken.current) return;          // same code seen twice in a row
          lastToken.current = text;
          submit(text);
        });
      } catch (e) {
        setCamError('Camera not available: ' + (e?.message || e) + '. Type the code instead.');
        setCamera(false);
      }
    })();
    return () => {
      stopped = true;
      const s = scanner.current; scanner.current = null;
      if (s) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <PageHead title="QR scanner" subtitle="Members show their 30-second code. Each code works once." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {camError && <div className="alert warn">{camError}</div>}
      <div className="grid g2">
        <Card title="Camera">
          {camera ? <div id="qr-reader" style={{ width: '100%', maxWidth: 420 }} /> : <p className="muted">Uses this computer's camera. The browser will ask for permission.</p>}
          <button className={camera ? '' : 'primary'} onClick={() => { setCamError(''); setCamera(!camera); }}>{camera ? 'Stop camera' : 'Start camera'}</button>
        </Card>
        <Card title="Type or paste the code">
          <form onSubmit={(e) => { e.preventDefault(); submit(code); }}>
            <textarea className="mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="64-character code shown under the member's QR" />
            <button className="primary" disabled={busy || code.trim().length < 10} style={{ marginTop: 8 }}>Check in</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
