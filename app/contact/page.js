import ContentPage from '@/app/components/ContentPage';

export const metadata = { title: 'Contact' };

const CHANNELS = [
  { name: 'GitHub', handle: 'github.com/ritstar', href: 'https://github.com/ritstar' },
  { name: 'X (Twitter)', handle: '@riteshjha0270', href: 'https://x.com/riteshjha0270' },
  { name: 'LinkedIn', handle: 'Ritesh Kumar Jha', href: 'https://www.linkedin.com/in/ritesh-kumar-jha-b90607a9/' },
];

export default function ContactPage() {
  return (
    <ContentPage
      eyebrow="Contact"
      title="Get in touch"
      lead="For feedback, feature requests, support or collaboration, reach out on any of these channels."
    >
      <div className="contact-grid">
        {CHANNELS.map((channel) => (
          <a key={channel.name} href={channel.href} target="_blank" rel="noreferrer" className="contact-card" style={{ textDecoration: 'none' }}>
            <span>
              <strong>{channel.name}</strong>
              <span>{channel.handle}</span>
            </span>
          </a>
        ))}
      </div>
    </ContentPage>
  );
}
