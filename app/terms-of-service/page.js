import ContentPage from '@/app/components/ContentPage';

export const metadata = { title: 'Terms of Service' };

export default function TermsOfServicePage() {
  return (
    <ContentPage eyebrow="Legal" title="Terms of Service" lead="Effective date: March 2, 2026">
      <h2>Use of service</h2>
      <p>You agree to use Forge PDF only for lawful purposes and only with files you are authorized to process.</p>
      <h2>Account responsibility</h2>
      <p>You are responsible for maintaining the confidentiality of your account and for activity performed under it.</p>
      <h2>Service availability</h2>
      <p>We may update, modify, or discontinue features to improve reliability, security, and product quality.</p>
    </ContentPage>
  );
}
