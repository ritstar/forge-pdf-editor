import Link from 'next/link';

export default function ForgeLogo({ href = '/', compact = false, className = '' }) {
  const content = (
    <span className={`forge-logo ${compact ? 'compact' : ''} ${className}`.trim()}>
      <svg viewBox="0 0 44 44" className="forge-logo-mark" aria-hidden="true">
        <defs>
          <linearGradient id="forgeLogoGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="36" height="36" rx="11" fill="url(#forgeLogoGradient)" />
        <path d="M13 31V13h18v4H18v4h11v4H18v6h-5z" fill="white" />
      </svg>
      {!compact ? (
        <span className="forge-logo-text">
          <strong>Forge</strong>
          <span>PDF</span>
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="forge-logo-link" aria-label="Forge PDF Home">
      {content}
    </Link>
  );
}
