import ContentPage from '@/app/components/ContentPage';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPolicyPage() {
  return (
    <ContentPage eyebrow="Legal" title="Privacy Policy" lead="Effective date: March 2, 2026">
      <h2>Information we collect</h2>
      <p>
        We collect account details required for authentication, document metadata required for product functionality,
        and usage events needed to improve reliability and performance.
      </p>
      <h2>How files are processed</h2>
      <p>
        Merge, split, organize, rotate, watermark, page numbering and image conversion run entirely in your browser; those
        files are not uploaded. Conversion, compression and security tools send the file to our processing service over an
        encrypted connection, and temporary copies are deleted as soon as the result is returned. Documents you upload to
        the editor are stored in your private workspace until you delete them.
      </p>
      <h2>How we use data</h2>
      <p>
        Data is used to provide your workspace, save drafts, protect account access, and troubleshoot product issues.
        We do not sell your personal data.
      </p>
      <h2>Security and storage</h2>
      <p>
        Documents and related data are tied to authenticated user accounts. Access controls are enforced through
        Firebase/Auth rules and backend validation.
      </p>
    </ContentPage>
  );
}
