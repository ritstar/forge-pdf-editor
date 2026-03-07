const globalStore = globalThis.__forgeRateLimitStore || new Map();

if (!globalThis.__forgeRateLimitStore) {
  globalThis.__forgeRateLimitStore = globalStore;
}

function now() {
  return Date.now();
}

function pruneExpiredEntries(currentTime) {
  for (const [key, entry] of globalStore.entries()) {
    if (entry.resetAt <= currentTime) {
      globalStore.delete(key);
    }
  }
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return request.headers.get('x-real-ip') || 'unknown';
}

export function takeRateLimitToken({ bucket, key, limit, windowMs }) {
  const currentTime = now();
  pruneExpiredEntries(currentTime);

  const storeKey = `${bucket}:${key}`;
  const existing = globalStore.get(storeKey);

  if (!existing || existing.resetAt <= currentTime) {
    const next = { count: 1, resetAt: currentTime + windowMs };
    globalStore.set(storeKey, next);
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  globalStore.set(storeKey, existing);
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}
