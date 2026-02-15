import Link from 'next/link';
import { FileText, Lock, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <h1>Forge PDF</h1>
        <div className="landing-nav-actions">
          <Link href="/login" className="ghost-btn">Login</Link>
          <Link href="/signup" className="primary-btn">Sign up</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div>
          <p className="eyebrow">Private workspace for serious PDF workflows</p>
          <h2>Edit, save drafts, and keep signatures ready for every session.</h2>
          <p>
            Forge PDF now supports user accounts, Google login, persistent signatures, and autosaved
            drafts so your work is always waiting when you come back.
          </p>
          <div className="landing-cta">
            <Link href="/signup" className="primary-btn">Start Free</Link>
            <Link href="/login" className="ghost-btn">I already have an account</Link>
          </div>
        </div>
        <div className="hero-panel">
          <h3>Built for repeat document work</h3>
          <ul>
            <li><FileText size={16} /> Resume drafts by account</li>
            <li><Sparkles size={16} /> Saved signatures library</li>
            <li><Lock size={16} /> User-scoped storage via Supabase</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
