export function backendUrl() {
  return (process.env.PDF_TOOLS_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
}

// URL the browser can reach. Defaults to the server-side URL, which is public on Render.
export function publicBackendUrl() {
  return (process.env.PDF_TOOLS_PUBLIC_URL || backendUrl()).replace(/\/+$/, '');
}

export function backendApiSecret() {
  return (process.env.PDF_TOOLS_API_SECRET || '').trim();
}
