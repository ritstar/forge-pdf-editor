// Prefer uploading straight to the backend with a short-lived token (no serverless body
// limit, one less hop). Falls back to the same-origin proxy if the backend is unreachable
// from the browser (CORS/network) or does not accept tokens yet.
export async function submitToolRequest(toolId, form) {
  try {
    const tokenRes = await fetch(`/api/pdf-tools/${toolId}`, { cache: 'no-store' });
    if (tokenRes.status === 401) {
      return tokenRes;
    }
    if (tokenRes.ok) {
      const { endpoint, token } = await tokenRes.json();
      const direct = await fetch(endpoint, {
        method: 'POST',
        headers: { 'x-forge-token': token },
        body: form,
      });
      if (direct.status !== 401 && direct.status !== 403) {
        return direct;
      }
    }
  } catch {
    // Network/CORS failure on the direct path: use the proxy below.
  }

  return fetch(`/api/pdf-tools/${toolId}`, { method: 'POST', body: form });
}
