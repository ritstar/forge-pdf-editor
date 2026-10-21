import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CloudOff,
  FileSignature,
  Gauge,
  Image as ImageIcon,
  PenLine,
  ShieldCheck,
  Type,
} from 'lucide-react';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';
import ToolCatalog from './components/ToolCatalog';
import { TOOLS } from '@/lib/toolsData';

function ProductMock() {
  return (
    <div style={{ position: 'relative' }}>
      <div className="mock-window" aria-hidden="true">
        <div className="mock-bar">
          <div className="mock-dots"><i /><i /><i /></div>
          <span className="mock-title">Service Agreement.pdf</span>
          <div className="mock-tools">
            <span><Type size={14} /></span>
            <span><ImageIcon size={14} /></span>
            <span className="on"><PenLine size={14} /></span>
          </div>
        </div>
        <div className="mock-body">
          <div className="mock-rail">
            {[0, 1, 2].map((n) => (
              <div key={n} className={`mock-thumb ${n === 0 ? 'on' : ''}`}>
                <i style={{ width: '70%' }} /><i /><i /><i style={{ width: '60%' }} />
              </div>
            ))}
          </div>
          <div className="mock-canvas">
            <div className="mock-page">
              <b />
              {[92, 100, 86, 97, 74, 100, 90, 64].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}
              <div className="mock-sign">A. Morgan</div>
              <div className="mock-field">Oct 21, 2026</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mock-float one">
        <span className="icon-tile sm" style={{ '--tile': 'var(--success)' }}><Check size={16} /></span>
        <span>Draft saved<small>Autosaved just now</small></span>
      </div>
      <div className="mock-float two">
        <span className="icon-tile sm" style={{ '--tile': 'var(--cat-edit)' }}><FileSignature size={16} /></span>
        <span>Signature added<small>Reusable across documents</small></span>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: PenLine,
    color: 'var(--cat-edit)',
    title: 'Edit and sign in minutes',
    body: 'Place text, images and saved signatures anywhere on the page, fill in PDF forms, and pick up where you left off with autosaved drafts.',
  },
  {
    icon: CloudOff,
    color: 'var(--success)',
    title: 'Private by default',
    body: 'Merge, split, rotate, watermark and image tools run entirely in your browser — your files never leave your device.',
  },
  {
    icon: Gauge,
    color: 'var(--cat-convert-to)',
    title: 'Fast and precise',
    body: 'Real compression that never makes files bigger, layout-aware Office conversion and table extraction to Excel.',
  },
];

export default function LandingPage() {
  const toolCount = TOOLS.length;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <Link href="#tools" className="pill-link">
                <span className="badge badge-accent">{toolCount} tools</span>
                Everything for PDFs in one place <ArrowRight size={14} />
              </Link>
              <h1>
                The PDF toolkit that <em>just works</em>.
              </h1>
              <p className="hero-lead">
                Edit, sign, convert, compress and organize PDFs right in your browser. No installs, no watermarks,
                and your work is saved as you go.
              </p>
              <div className="hero-actions">
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Get started — it&apos;s free <ArrowRight size={17} />
                </Link>
                <Link href="#tools" className="btn btn-secondary btn-lg">Browse tools</Link>
              </div>
              <div className="hero-trust">
                <span><Check size={15} /> Free to use</span>
                <span><Check size={15} /> No watermarks</span>
                <span><Check size={15} /> Works on any device</span>
              </div>
            </div>
            <ProductMock />
          </div>
        </section>

        <section className="container" aria-label="Highlights">
          <div className="stat-strip">
            <div><strong>{toolCount}</strong><span>PDF tools in one workspace</span></div>
            <div><strong>AES-256</strong><span>Password protection</span></div>
            <div><strong>50 MB</strong><span>Maximum file size</span></div>
            <div><strong>0</strong><span>Watermarks on your files</span></div>
          </div>
        </section>

        <section className="section" id="tools">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Tools</span>
              <h2>Every PDF tool you need</h2>
              <p>Pick a tool to get started. Your files are handled securely and deleted after processing.</p>
            </div>
            <ToolCatalog />
          </div>
        </section>

        <section className="section" id="features" style={{ paddingTop: 24 }}>
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Why Forge</span>
              <h2>Built for real document work</h2>
            </div>
            <div className="feature-grid">
              {FEATURES.map(({ icon: Icon, color, title, body }) => (
                <article key={title} className="feature">
                  <span className="icon-tile" style={{ '--tile': color }}><Icon size={20} /></span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 24 }}>
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <h2>Three steps, no learning curve</h2>
            </div>
            <div className="steps">
              <div className="step">
                <h3>Upload your PDF</h3>
                <p>Drop a file or pick one from your device. Large documents up to 50 MB are supported.</p>
              </div>
              <div className="step">
                <h3>Edit, convert or organize</h3>
                <p>Use the editor or any tool. Undo anything with <span className="kbd">⌘Z</span> — drafts autosave as you work.</p>
              </div>
              <div className="step">
                <h3>Download the result</h3>
                <p>Get a clean, standards-compliant PDF instantly, ready to send or archive.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="container">
          <div className="cta-band">
            <div>
              <h2>Start working with your PDFs</h2>
              <p>Create a free account to save drafts and reusable signatures.</p>
            </div>
            <div className="toolbar" style={{ flexWrap: 'wrap' }}>
              <Link href="/signup" className="btn btn-primary btn-lg">Create free account <ArrowRight size={17} /></Link>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={15} /> Secure sign-in with Google or email · your documents stay private to your account
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
