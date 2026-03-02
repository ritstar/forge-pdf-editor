import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={{
      textAlign: 'center',
      padding: '24px',
      marginTop: '36px',
      borderTop: '1px solid var(--line)',
      color: 'var(--muted)',
      fontSize: '0.9rem',
      background: 'transparent'
    }}>
      © {new Date().getFullYear()} Forge PDF. Crafted with real human input by{' '}
      <a href="https://github.com/ritstar" target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}>RitstaR</a>.
    </footer>
  );
}
