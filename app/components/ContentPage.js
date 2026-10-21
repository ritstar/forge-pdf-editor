import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function ContentPage({ eyebrow, title, lead, children }) {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <article className="prose-page">
          <header>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            {lead ? <p>{lead}</p> : null}
          </header>
          <div className="prose">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
