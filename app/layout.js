import './globals.css';

export const metadata = {
  title: 'Forge PDF',
  description: 'User-based PDF editor with Google login, saved signatures, and draft autosave powered by Supabase.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
