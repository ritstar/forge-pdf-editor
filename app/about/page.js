import Link from 'next/link';
import ForgeLogo from '@/app/components/ForgeLogo';
import LandingFooter from '@/app/components/LandingFooter';

export default function AboutPage() {
  return (
    <main className="landing-page" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <header className="landing-nav">
        <ForgeLogo href="/" />
        <div className="landing-nav-actions">
          <Link href="/" className="ghost-btn">Home</Link>
          <Link href="/app" className="primary-btn">Dashboard</Link>
        </div>
      </header>

      <section className="hero" style={{ marginTop: '24px' }}>
        <p className="eyebrow">About Forge PDF</p>
        <h1 style={{ margin: '8px 0 10px' }}>Built for fast, practical PDF workflows</h1>
        <p>
          Forge PDF is a modern PDF toolkit focused on real tasks: editing, annotating,
          signing, converting, and organizing files with minimal friction.
        </p>
      </section>

      <section style={{ marginTop: '18px' }} className="dashboard-panel">
        <h2 style={{ margin: '0 0 10px' }}>What we focus on</h2>
        <p className="muted" style={{ margin: 0 }}>
          We prioritize clear UI, fast interactions, private user-scoped storage, and a workflow
          that lets you resume document work anytime.
        </p>
      </section>

      <section style={{ marginTop: '18px' }} className="dashboard-panel">
        <h2 style={{ margin: '0 0 10px' }}>Connect</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>
          Follow or reach out here:
        </p>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '8px' }}>
          <li><a href="https://github.com/ritstar" target="_blank" rel="noreferrer">GitHub</a></li>
          <li><a href="https://x.com/riteshjha0270" target="_blank" rel="noreferrer">X (Twitter)</a></li>
          <li><a href="https://www.linkedin.com/in/ritesh-kumar-jha-b90607a9/" target="_blank" rel="noreferrer">LinkedIn</a></li>
        </ul>
      </section>
      <LandingFooter />
    </main>
  );
}
