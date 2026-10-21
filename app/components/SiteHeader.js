'use client';

import Link from 'next/link';
import ForgeLogo from './ForgeLogo';
import ThemeToggle from './ui/ThemeToggle';
import { useAuthUser } from '@/app/utils/useAuthUser';

export default function SiteHeader() {
  const { status } = useAuthUser();

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <ForgeLogo href="/" />
        <nav className="nav-links" aria-label="Main">
          <Link href="/#tools" className="nav-link">Tools</Link>
          <Link href="/#features" className="nav-link">Features</Link>
          <Link href="/about" className="nav-link">About</Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {status === 'signed-in' ? (
            <Link href="/app" className="btn btn-primary">Open dashboard</Link>
          ) : (
            <span style={{ display: 'flex', gap: 8, visibility: status === 'loading' ? 'hidden' : 'visible' }}>
              <Link href="/login" className="btn btn-ghost hide-xs">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Get started</Link>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
