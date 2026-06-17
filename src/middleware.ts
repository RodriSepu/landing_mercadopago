import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_, next) => {
  const response = await next();
  const headers = new Headers(response.headers);

  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
});
