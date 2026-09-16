import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const isDev = process.env.NODE_ENV === "development";

// Everything the browser loads is same-origin: next/font self-hosts Assistant, the logos are in
// /public, and GA, SMOOV and Salesforce are called only from the server. Next's inline
// bootstrap scripts need 'unsafe-inline'; `next dev` also needs eval and its HMR websocket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // CSV uploads at /admin/data go through a server action; Salesforce report exports run to a few MB.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
    ];
  },
};

export default nextConfig;
