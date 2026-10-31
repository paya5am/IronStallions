'use client';
// Shows a single-use check-in QR code that expires after 30 seconds.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useApi, useAction, api, Card, Alert, PageHead, Loading, fmtDateTime } from '@/components/ui';

export default function CheckInPage() {
  const visit = useApi('/api/member/visit');
  const { msg, setMsg, busy, run } = useAction();
  const [qr, setQr] = useState(null);       // { token, image }
  const [left, setLeft] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  // while a code is showing, poll the visit so the page updates the moment the desk scans it
  useEffect(() => {
    if (!qr || visit.data?.visit) return undefined;
    const t = setInterval(() => visit.reload(), 3000);
    return () => clearInterval(t);
  }, [qr, visit]);

  useEffect(() => { if (visit.data?.visit) { setQr(null); clearInterval(timer.current); } }, [visit.data]);

  const generate = async () => {
    const r = await run(() => api.post('/api/member/qr'), ' ');
    if (!r) return;
    setMsg(null);
    const image = await QRCode.toDataURL(r.token, { width: 520, margin: 2, errorCorrectionLevel: 'M' });
    setQr({ token: r.token, image });
    setLeft(r.secondsLeft);
    clearInterval(timer.current);
    timer.current = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(timer.current); return 0; }
      return s - 1;
    }), 1000);
  };

  const checkout = async () => {
    const r = await run(() => api.post('/api/member/visit'), 'Checked out. See you next time.');
    if (r) visit.reload();
  };

  if (!visit.data) return <Loading state={visit} />;
  const v = visit.data.visit;

  return (
    <div className="stack">
      <PageHead title="Check-in" subtitle="Show this code at the front desk scanner. It works once and expires in 30 seconds." />
      <Alert msg={msg} onClose={() => setMsg(null)} />
      {v ? (
        <Card title="You are checked in">
          <p>At <b>{v.branch_name}</b> since {fmtDateTime(v.check_in_time)}. Visits close automatically after 3 hours.</p>
          <button className="danger" onClick={checkout} disabled={busy}>Check out</button>
        </Card>
      ) : (
        <Card>
          <div className="qrbox">
            {qr && left > 0 ? (
              <>
                <img src={qr.image} alt="Check-in QR code" />
                <div className="countdown">{left}s</div>
                <details><summary className="small">Scanner not working? Show the code as text</summary><p className="mono">{qr.token}</p></details>
              </>
            ) : (
              <>
                <p className="muted">{qr ? 'The code expired. Generate a new one at the door.' : 'Generate your code when you reach the front desk.'}</p>
                <button className="primary" onClick={generate} disabled={busy}>Generate QR code</button>
              </>
            )}
          </div>
        </Card>
      )}
      <p className="small muted">Your plan must be active and its tier must cover the branch. Only one login per account is allowed, so a screenshot or a shared account cannot be used to enter.</p>
    </div>
  );
}
