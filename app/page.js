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
          <h3>Everything you need in one PDF editor</h3>
          <ul>
            <li><FileText size={16} /> Edit PDFs with text, images, and signatures</li>
            <li><Sparkles size={16} /> Resume PDF drafts anytime from your dashboard</li>
            <li><Lock size={16} /> Private, user-scoped document storage</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
