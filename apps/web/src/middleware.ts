import { defineMiddleware } from 'astro:middleware';

/**
 * Header keamanan untuk storefront. CSP di sini adalah baseline; di
 * production sebaiknya dipindah ke Cloudflare/WAF dan memakai nonce.
 * Catatan pelanggan dirender sebagai teks (di-escape framework), jadi
 * tidak ada HTML mentah yang dieksekusi.
 */
const API_ORIGIN = process.env.API_BASE_URL ?? import.meta.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const PUBLIC_API = import.meta.env.PUBLIC_API_URL ?? process.env.PUBLIC_API_URL ?? API_ORIGIN;

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${PUBLIC_API}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'geolocation=(self)');
  return response;
});
