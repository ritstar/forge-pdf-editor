'use client';

import Link from 'next/link';
import { Clock3, FileText, Lock, Moon, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import ForgeLogo from './components/ForgeLogo';

export default function LandingPage() {
  const [theme, setTheme] = useState('light');

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
            className="ghost-btn"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <Link href="/login" className="ghost-btn">Login</Link>
          <Link href="/signup" className="primary-btn">Sign up</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div>
          <p className="eyebrow">Private workspace for serious PDF workflows</p>
          <h2>A full PDF editor for signing, annotating, and exporting documents.</h2>
          <p>
            Upload any PDF, add text, images, and signatures, then export a clean final file.
            Your drafts and saved signatures stay linked to your account.
          </p>
          <div className="landing-cta">
            <Link href="/signup" className="primary-btn">Start Free</Link>
            <Link href="/login" className="ghost-btn">I already have an account</Link>
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

      <section className="landing-grid">
        <article className="landing-card">
          <h3><Clock3 size={18} /> Built for Speed</h3>
          <p className="muted">Upload and start editing in seconds. Drafts autosave while you work.</p>
        </article>
        <article className="landing-card">
          <h3><ShieldCheck size={18} /> Account-Based Security</h3>
          <p className="muted">Each user gets isolated files, signatures, and draft history.</p>
        </article>
        <article className="landing-card">
          <h3><Sparkles size={18} /> Fill & Sign Ready</h3>
          <p className="muted">Supports interactive form fields and quick-fill for non-fillable PDFs.</p>
        </article>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <ForgeLogo href="/" compact />
          <p className="muted small">
            Forge PDF helps you edit, sign, and export documents with a reliable account-based workflow.
          </p>
        </div>
        <div className="landing-footer-links">
          <Link href="/signup">Create Account</Link>
          <Link href="/login">Login</Link>
          <a href="https://github.com/ritstar" target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <p className="landing-footer-credit">
          Crafted with real human input by{' '}
          <a href="https://github.com/ritstar" target="_blank" rel="noreferrer">RitstaR</a>
          .
        </p>
      </footer>
    </main>
  );
}
