import Link from 'next/link';
import ForgeLogo from '@/app/components/ForgeLogo';
import LandingFooter from '@/app/components/LandingFooter';

export default function TermsOfServicePage() {
  return (
    <main className="landing-page" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
      <header className="landing-nav">
        <ForgeLogo href="/" />
        <div className="landing-nav-actions">
          <Link href="/" className="ghost-btn">Home</Link>
          <Link href="/contact" className="ghost-btn">Contact</Link>
        </div>
      </header>

      <section className="hero" style={{ marginTop: '24px' }}>
        <p className="eyebrow">Legal</p>
        <h1 style={{ margin: '8px 0 10px' }}>Terms of Service</h1>
        <p>Effective date: March 2, 2026</p>
      </section>

      <section className="dashboard-panel" style={{ marginTop: '18px', display: 'grid', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 10px' }}>Use of Service</h2>
          <p className="muted" style={{ margin: 0 }}>
            You agree to use Forge PDF only for lawful purposes and only with files you are authorized to process.
          </p>
        </div>

        <div>
          <h2 style={{ margin: '0 0 10px' }}>Account Responsibility</h2>
          <p className="muted" style={{ margin: 0 }}>
            You are responsible for maintaining the confidentiality of your account and for activity performed under it.
          </p>
        </div>

        <div>
          <h2 style={{ margin: '0 0 10px' }}>Service Availability</h2>
          <p className="muted" style={{ margin: 0 }}>
            We may update, modify, or discontinue features to improve reliability, security, and product quality.
          </p>
        </div>
      </section>
      <LandingFooter />
    </main>
  );
}
