import Link from 'next/link';
import ForgeLogo from '@/app/components/ForgeLogo';
import LandingFooter from '@/app/components/LandingFooter';

export default function ContactPage() {
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
        <p className="eyebrow">Contact</p>
        <h1 style={{ margin: '8px 0 10px' }}>Get in touch</h1>
        <p>
          For feedback, feature requests, support, or collaboration, use one of the channels below.
        </p>
      </section>

      <section className="dashboard-panel" style={{ marginTop: '18px' }}>
        <h2 style={{ margin: '0 0 10px' }}>Reach Us</h2>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '10px' }}>
          <li>
            GitHub: <a href="https://github.com/ritstar" target="_blank" rel="noreferrer">github.com/ritstar</a>
          </li>
          <li>
            X (Twitter): <a href="https://x.com/riteshjha0270" target="_blank" rel="noreferrer">x.com/riteshjha0270</a>
          </li>
          <li>
            LinkedIn: <a href="https://www.linkedin.com/in/ritesh-kumar-jha-b90607a9/" target="_blank" rel="noreferrer">ritesh-kumar-jha-b90607a9</a>
          </li>
        </ul>
      </section>
      <LandingFooter />
    </main>
  );
}
