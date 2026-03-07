const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const frameSrc = [
  "'self'",
  'https://accounts.google.com',
  'https://apis.google.com',
];

if (firebaseAuthDomain) {
  frameSrc.push(`https://${firebaseAuthDomain}`);
}

/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  `frame-src ${frameSrc.join(' ')}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ];

    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Content-Security-Policy', value: csp });
    }

    return [
      {
        source: '/(.*)',
        headers,
      },
    ];
  },
};

export default nextConfig;
