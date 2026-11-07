import type { FastifyInstance } from 'fastify';

// Scripts run only from our own files, so injected markup can't run code. Styles allow inline
// because the dialog and toast libraries add <style> elements as they run.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const ALWAYS = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  // Not no-referrer: that makes browsers send "Origin: null" on forms, which the origin check refuses.
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

/** Adds the browser protections to every response, including errors. */
export function registerSecurityHeaders(app: FastifyInstance, publicUrl: string): void {
  const isHttps = new URL(publicUrl).protocol === 'https:';
  const headers: Record<string, string> = {
    ...ALWAYS,
    'content-security-policy': [
      ...CONTENT_SECURITY_POLICY,
      ...(isHttps ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
    // One year. Subdomains are left out, because they may be other people's services.
    ...(isHttps ? { 'strict-transport-security': 'max-age=31536000' } : {}),
  };

  app.addHook('onRequest', (request, reply, done) => {
    void reply.headers(headers);
    // API responses hold private data, which shouldn't stay on a shared computer.
    if (request.url.startsWith('/api/')) void reply.header('cache-control', 'no-store');
    done();
  });
}
