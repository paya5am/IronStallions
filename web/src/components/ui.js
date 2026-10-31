'use client';
// Small UI kit and data helpers shared by all pages.
import { useCallback, useEffect, useState } from 'react';

// ---------- data ----------
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth/')) {
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  patch: (url, body) => request('PATCH', url, body || {}),
  del: (url) => request('DELETE', url),
};

// Loads url (re-runs when it changes). Returns { data, error, loading, reload }.
export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api.get(url);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Runs an action and keeps a message for the page to show.
export function useAction() {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okText) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      setMsg({ kind: 'ok', text: (r && r.message) || okText || 'Done.' });
      return r;
    } catch (e) {
      setMsg({ kind: 'bad', text: e.message });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { msg, setMsg, busy, run };
}

// ---------- formatting ----------
export const rupees = (v) => (v === null || v === undefined ? '-' : 'Rs ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 }));
export const fmtDate = (s) => {
  if (!s) return '-';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (s) => {
  if (!s) return '-';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? s : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
export const hhmm = (t) => (t ? String(t).slice(0, 5) : '-');
export const recordLabel = (type, value) => {
  const v = Number(value);
  switch (type) {
    case 'MAX_WEIGHT': return `${v} kg`;
    case 'MAX_VOLUME': return `${v} kg volume`;
    case 'MAX_REPS': return `${v} reps`;
    case 'MAX_DURATION': return `${Math.round(v / 60)} min`;
    case 'MAX_DISTANCE': return `${(v / 1000).toFixed(2)} km`;
    default: return String(v);
  }
};

// ---------- components ----------
const TONE = {
  ACTIVE: 'ok', PAID: 'ok', AVAILABLE: 'ok', COMPLETED: 'ok', RESOLVED: 'ok', ACHIEVED: 'ok', PASS: 'ok', ACCEPTED: 'ok',
  UPCOMING: 'info', SCHEDULED: 'info', OCCUPIED: 'info', IN_PROGRESS: 'info', PARTIAL: 'warn', PENDING: 'warn', REPORTED: 'warn',
  OVERDUE: 'bad', EXPIRED: 'bad', CANCELLED: 'bad', MAINTENANCE: 'bad', NO_SHOW: 'bad', RETIRED: '', REFUSED: 'bad',
  UPGRADED: 'info', DOWNGRADED: 'info', SILVER: '', GOLD: 'warn', DIAMOND: 'info',
};
export function Badge({ value, tone }) {
  if (value === null || value === undefined) return null;
  return <span className={`badge ${tone ?? TONE[value] ?? ''}`}>{String(value).replace(/_/g, ' ')}</span>;
}

export function Alert({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className={`alert ${msg.kind}`} role="status">
      <div className="spread"><span>{msg.text}</span>{onClose && <button className="small ghost" onClick={onClose}>Close</button>}</div>
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="spread" style={{ marginBottom: 10 }}>{title && <h2 style={{ margin: 0 }}>{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="pagehead">
      <div><h1>{title}</h1>{subtitle && <div className="muted">{subtitle}</div>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Loading({ state }) {
  if (state.error) return <div className="alert bad">{state.error}</div>;
  if (state.loading && !state.data) return <div className="muted">Loading...</div>;
  return null;
}

// columns: [{ key, label, render?, num? }]
export function Table({ columns, rows, empty = 'Nothing to show.', rowKey }) {
  if (!rows || rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r) : i}>
              {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key] ?? '-'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Vertical bars. items: [{ label, value }]
export function Bars({ items, format = (v) => v, height = 150 }) {
  if (!items || !items.length) return <div className="empty">No data yet.</div>;
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return (
    <div className="bars" style={{ height }}>
      {items.map((i, k) => (
        <div className="bar" key={k} title={`${i.label}: ${format(i.value)}`}>
          <div className="val">{format(i.value)}</div>
          <div className={`fill ${i.alt ? 'alt' : ''}`} style={{ height: `${((Number(i.value) || 0) / max) * 100}%` }} />
          <div className="lab">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

// Horizontal bars. items: [{ label, value }]
export function HBars({ items, format = (v) => v }) {
  if (!items || !items.length) return <div className="empty">No data yet.</div>;
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
  return (
    <div className="hbars">
      {items.map((i, k) => (
        <div className="hrow" key={k}>
          <span title={i.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
          <div className="track"><div style={{ width: `${((Number(i.value) || 0) / max) * 100}%` }} /></div>
          <span className="num" style={{ textAlign: 'right' }}>{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

export const MUSCLES = ['CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'LEGS', 'CORE', 'FULL_BODY', 'CARDIO'];
