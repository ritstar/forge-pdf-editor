'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Moon, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import ForgeLogo from './components/ForgeLogo';
import LandingFooter from './components/LandingFooter';
import { TOOLS } from '@/lib/toolsData';

const COMING_SOON_TOOL_IDS = new Set([
  'compress-pdf',
  'pdf-to-word',
  'pdf-to-powerpoint',
  'pdf-to-excel',
  'word-to-pdf',
  'powerpoint-to-pdf',
  'excel-to-pdf',
  'html-to-pdf',
  'protect-pdf',
  'pdf-to-pdfa',
  'repair-pdf',
]);

export default function LandingPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('light');
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const availableTools = TOOLS.filter((tool) => !COMING_SOON_TOOL_IDS.has(tool.id));
  const comingSoonTools = TOOLS.filter((tool) => COMING_SOON_TOOL_IDS.has(tool.id));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const storedTheme = window.localStorage.getItem('forge-theme');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
      setTheme(initialTheme);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('forge-theme', theme);
  }, [theme]);

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <ForgeLogo href="/" />
        <div className="landing-nav-actions">
          <button
            type="button"
            className="ghost-btn theme-toggle"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-toggle-label">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
          {!authChecking && user ? (
            <Link href="/app" className="primary-btn">Go to Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="ghost-btn" style={{ visibility: authChecking ? 'hidden' : 'visible' }}>Login</Link>
              <Link href="/signup" className="primary-btn" style={{ visibility: authChecking ? 'hidden' : 'visible' }}>Sign up</Link>
            </>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div>
          <p className="eyebrow">The complete PDF toolkit</p>
          <h2>Every tool you need to use PDFs, at your fingertips.</h2>
          <p>
            Merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.
            All tools are 100% free and easy to use.
          </p>
          <div className="landing-cta">
            {!authChecking && user ? (
               <Link href="/app" className="primary-btn">Go to Dashboard</Link>
            ) : (
              <>
                <Link href="/signup" className="primary-btn" style={{ visibility: authChecking ? 'hidden' : 'visible' }}>Start Free</Link>
                <Link href="/login" className="ghost-btn" style={{ visibility: authChecking ? 'hidden' : 'visible' }}>I already have an account</Link>
              </>
            )}
          </div>
        </div>
        <div className="hero-panel">
          <h3>Everything you need in one workflow</h3>
          <ul>
            <li><FileText size={16} /> Edit PDFs with text, images, and signatures</li>
            <li><Sparkles size={16} /> Resume PDF drafts anytime from your dashboard</li>
            <li><Lock size={16} /> Private, user-scoped document storage</li>
          </ul>
        </div>
      </section>

      <section className="tools-grid-wrapper" style={{ marginTop: '40px', marginBottom: '60px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '2rem', letterSpacing: '-0.02em' }}>Explore All PDF Tools</h2>
        <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {availableTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                href={tool.href}
                key={tool.id}
                className="landing-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  textDecoration: 'none',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                  <div style={{ color: tool.color, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tool.color}15`, padding: '12px', borderRadius: '12px' }}>
                    <Icon size={26} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>{tool.name}</h3>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>
        {comingSoonTools.length ? (
          <>
            <h3 style={{ textAlign: 'center', margin: '34px 0 18px', fontSize: '1.35rem', letterSpacing: '-0.01em' }}>Coming Soon</h3>
            <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {comingSoonTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    href={tool.href}
                    key={tool.id}
                    className="landing-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      textDecoration: 'none',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                      <div style={{ color: tool.color, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tool.color}15`, padding: '12px', borderRadius: '12px' }}>
                        <Icon size={26} />
                      </div>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>{tool.name}</h3>
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>
                      {tool.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      <LandingFooter />
    </main>
  );
}
