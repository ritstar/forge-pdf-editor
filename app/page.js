'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Moon, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import ForgeLogo from './components/ForgeLogo';
import { TOOLS } from '@/lib/toolsData';

export default function LandingPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('light');
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

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
          {TOOLS.map((tool) => {
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
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <ForgeLogo href="/" />
          <p className="muted" style={{ marginTop: '16px', lineHeight: '1.6', maxWidth: '300px' }}>
            Forge PDF is your ultimate toolkit for all your document needs. Merge, split, convert, and edit PDFs with a secure, private, and frictionless experience.
          </p>
          <div className="social-links" style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            {/* Social Links */}
            <a href="https://github.com/ritstar" target="_blank" rel="noreferrer" aria-label="GitHub" className="social-icon-btn">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
            </a>
            <a href="https://x.com/riteshjha0270" target="_blank" rel="noreferrer" aria-label="X (Twitter)" className="social-icon-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
            </a>
            <a href="https://www.linkedin.com/in/ritesh-kumar-jha-b90607a9/" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="social-icon-btn">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
            </a>
          </div>
        </div>

        <div className="footer-links-group">
          <h4>Product</h4>
          <ul>
            <li><Link href="/tools/merge">Merge PDF</Link></li>
            <li><Link href="/tools/split">Split PDF</Link></li>
            <li><Link href="/tools/compress">Compress PDF</Link></li>
            <li><Link href="/app">Sign & Edit</Link></li>
            <li><Link href="/tools/jpg-to-pdf">Image to PDF</Link></li>
          </ul>
        </div>

        <div className="footer-links-group">
          <h4>Account</h4>
          <ul>
            <li><Link href="/login">Log in</Link></li>
            <li><Link href="/signup">Sign up</Link></li>
            <li><Link href="/app">Dashboard</Link></li>
          </ul>
        </div>

        <div className="footer-links-group">
          <h4>Company</h4>
          <ul>
            <li><Link href="#">About Us</Link></li>
            <li><Link href="#">Privacy Policy</Link></li>
            <li><Link href="#">Terms of Service</Link></li>
            <li><Link href="#">Contact</Link></li>
          </ul>
        </div>

        <div className="landing-footer-bottom">
          <p className="landing-footer-credit">
            © {new Date().getFullYear()} Forge PDF. Crafted with real human input by{' '}
            <a href="https://github.com/ritstar" target="_blank" rel="noreferrer">RitstaR</a>.
          </p>
        </div>
      </footer>
    </main>
  );
}
