import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Playwright E2E suite (playwright.config.ts) drives `next dev` via 127.0.0.1 instead of
  // localhost. Without this, Next's dev-origin check silently blocks dev-only client requests
  // (HMR, and the client bootstrap that attaches React event handlers), leaving every page
  // server-rendered but non-interactive.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
