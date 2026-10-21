'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, Wrench } from 'lucide-react';
import ForgeLogo from './ForgeLogo';
import ThemeToggle from './ui/ThemeToggle';
import Menu from './ui/Menu';
import { signOutEverywhere, useAuthUser } from '@/app/utils/useAuthUser';

export function initialsOf(user) {
  const source = user?.displayName || user?.email || '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function Avatar({ user }) {
  return (
    <span className="avatar">
      {user?.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
      ) : (
        initialsOf(user)
      )}
    </span>
  );
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthUser();

  const handleSignOut = async () => {
    await signOutEverywhere();
    router.push('/');
    router.refresh();
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <ForgeLogo href="/app" />
        <nav className="nav-links" aria-label="App">
          <Link href="/app" className={`nav-link ${pathname === '/app' ? 'active' : ''}`}>Dashboard</Link>
          <Link href="/app#tools" className={`nav-link ${pathname.startsWith('/tools') ? 'active' : ''}`}>Tools</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Menu
            trigger={({ toggle, ...aria }) => (
              <button type="button" className="avatar-btn" onClick={toggle} aria-label="Account menu" {...aria}>
                <Avatar user={user} />
              </button>
            )}
          >
            <div className="user-menu-head">
              <Avatar user={user} />
              <div>
                <strong>{user?.displayName || 'Your account'}</strong>
                <span>{user?.email}</span>
              </div>
            </div>
            <div className="menu-sep" />
            <Link href="/app" role="menuitem" className="menu-item">
              <LayoutDashboard size={16} /> Dashboard
            </Link>
            <Link href="/app#tools" role="menuitem" className="menu-item">
              <Wrench size={16} /> All tools
            </Link>
            <div className="menu-sep" />
            <button type="button" role="menuitem" className="menu-item" onClick={handleSignOut}>
              <LogOut size={16} /> Sign out
            </button>
          </Menu>
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      © {new Date().getFullYear()} Forge PDF ·{' '}
      <Link href="/privacy-policy">Privacy</Link> · <Link href="/terms-of-service">Terms</Link>
    </footer>
  );
}
