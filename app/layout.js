import './globals.css';

export const metadata = {
  title: 'Forge PDF Editor',
  description: 'Edit PDF files with text, images, signatures, and export controls directly in your browser.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
