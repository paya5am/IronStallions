'use client';
// Page frame for every portal: role check, navigation, logout.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV, ROLE_TITLE } from '@/lib/nav';
import { api } from './ui';

export default function AppShell({ role, children }) {
  const [me, setMe] = useState(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api.get('/api/auth/me')
      .then((u) => {
        if (u.role !== role) router.replace('/' + u.role.toLowerCase());
        else setMe(u);
      })
      .catch(() => router.replace('/login'));
  }, [role, router]);

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {});
    router.replace('/login');
  }

  if (!me) return <div className="main muted">Checking your session...</div>;
  const links = NAV[role];
  const active = (href) => pathname === href || (href !== '/' + role.toLowerCase() && pathname.startsWith(href + '/'));
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">IronStallions<small>{ROLE_TITLE[role]} portal</small></div>
        <nav className="nav">
          {links.map((l) => <Link key={l.href} href={l.href} className={active(l.href) ? 'active' : ''}>{l.label}</Link>)}
        </nav>
        <div className="who">
          <div><b>{me.name}</b>Session ends {new Date(me.expires_at.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <button className="small" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
