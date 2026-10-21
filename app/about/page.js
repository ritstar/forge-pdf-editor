import Link from 'next/link';
import ContentPage from '@/app/components/ContentPage';

export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About"
      title="Built for fast, practical PDF workflows"
      lead="Forge PDF is a modern PDF toolkit focused on real tasks: editing, signing, converting and organizing files with minimal friction."
    >
      <h2>What we focus on</h2>
      <p>
        We prioritize a clear interface, fast interactions, private user-scoped storage, and a workflow that lets you
        resume document work anytime. Most tools run directly in your browser, so your files stay on your device.
      </p>
      <h2>Get in touch</h2>
      <p>
        Questions, feedback or ideas? See the <Link href="/contact">contact page</Link>.
      </p>
    </ContentPage>
  );
}
