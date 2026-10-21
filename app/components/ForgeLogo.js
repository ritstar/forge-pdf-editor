import Link from 'next/link';

export default function ForgeLogo({ href = '/', compact = false, className = '' }) {
  const content = (
    <span className={`forge-logo ${compact ? 'compact' : ''} ${className}`.trim()}>
      <svg viewBox="0 0 32 32" className="forge-logo-mark" aria-hidden="true">
        <defs>
          <linearGradient id="forgeLogoGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#forgeLogoGradient)" />
        <path d="M10.5 23.5v-15h11v3.2h-7.4v2.9h6.5v3.1h-6.5v5.8z" fill="#fff" />
      </svg>
      {!compact ? (
        <span className="forge-logo-text">
          Forge <span>PDF</span>
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="Forge PDF home">
      {content}
    </Link>
  );
}
