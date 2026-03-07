import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Forge PDF',
  description: 'User-based PDF editor with Google login, saved signatures, and draft autosave powered by Firebase.',
  icons: {
    icon: '/forge-mark.svg',
    shortcut: '/forge-mark.svg',
    apple: '/forge-mark.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
