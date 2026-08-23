import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the stack.
  poweredByHeader: false,

  // The local reader loads tesseract.js's WASM core and pdf.js from disk at
  // runtime. Bundling them rewrites the paths they use to find their own
  // worker and .wasm files, so they stay external.
  serverExternalPackages: ["tesseract.js", "unpdf"],

  // The English traineddata is served from this repo, never from a CDN, so it
  // has to be traced into the serverless function that OCRs.
  outputFileTracingIncludes: {
    "/api/documents/[id]/extract-local": ["./tessdata/**"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: without this, /login can be framed and overlaid to
          // harvest credentials.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
