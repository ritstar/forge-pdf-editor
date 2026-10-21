import './globals.css';
import Script from 'next/script';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata = {
  title: {
    default: 'Forge PDF — Edit, sign, convert and organize PDFs',
    template: '%s · Forge PDF',
  },
  description:
    'A complete PDF toolkit in your browser: edit and sign PDFs, merge, split, compress, convert to and from Office formats, and more.',
  icons: {
    icon: '/forge-mark.svg',
    shortcut: '/forge-mark.svg',
    apple: '/forge-mark.svg',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c11' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
