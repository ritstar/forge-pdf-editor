import Link from 'next/link';
import ForgeLogo from '@/app/components/ForgeLogo';
import LandingFooter from '@/app/components/LandingFooter';

export default function PrivacyPolicyPage() {
  return (
    <main className="landing-page" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <header className="landing-nav">
        <ForgeLogo href="/" />
        <div className="landing-nav-actions">
          <Link href="/" className="ghost-btn">Home</Link>
          <Link href="/about" className="ghost-btn">About</Link>
        </div>
      </header>

      <section className="hero" style={{ marginTop: '24px' }}>
        <p className="eyebrow">Legal</p>
        <h1 style={{ margin: '8px 0 10px' }}>Privacy Policy</h1>
        <p>Effective date: March 2, 2026</p>
      </section>

      <section className="dashboard-panel" style={{ marginTop: '18px', display: 'grid', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 10px' }}>Information We Collect</h2>
          <p className="muted" style={{ margin: 0 }}>
            We collect account details required for authentication, document metadata required for product functionality,
            and usage events needed to improve reliability and performance.
          </p>
        </div>

        <div>
          <h2 style={{ margin: '0 0 10px' }}>How We Use Data</h2>
          <p className="muted" style={{ margin: 0 }}>
            Data is used to provide your workspace, save drafts, protect account access, and troubleshoot product issues.
            We do not sell your personal data.
          </p>
        </div>

        <div>
          <h2 style={{ margin: '0 0 10px' }}>Security and Storage</h2>
          <p className="muted" style={{ margin: 0 }}>
            Documents and related data are tied to authenticated user accounts. Access controls are enforced through
            Firebase/Auth rules and backend validation.
          </p>
        </div>
      </section>
      <LandingFooter />
    </main>
  );
}
