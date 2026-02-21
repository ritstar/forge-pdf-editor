import './globals.css';

export const metadata = {
  title: 'Forge PDF',
  description: 'User-based PDF editor with Google login, saved signatures, and draft autosave powered by Supabase.',
  icons: {
    icon: '/forge-mark.svg',
    shortcut: '/forge-mark.svg',
    apple: '/forge-mark.svg',
  },
};

const themeInitScript = `
(() => {
  try {
    const stored = localStorage.getItem('forge-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
