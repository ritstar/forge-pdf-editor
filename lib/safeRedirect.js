// Only allow same-origin relative paths. Browsers treat "\" like "/", so "/\evil.com" would
// otherwise become a protocol-relative redirect to another site.
export function safeNextPath(value, fallback = '/app') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  return value;
}
