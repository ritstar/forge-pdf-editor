/**
 * Sanitize a filename to be safe for storage paths.
 * Converts to lowercase and replaces invalid characters with hyphens.
 */
export function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}
