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
            // microphone=(self), not (): the voice note in the health check and the
            // media timeline both need getUserMedia, and microphone=() is not a
            // prompt the user can accept — it makes the call reject outright, in
            // every browser, with nothing the owner could do about it. (self)
            // still blocks every embedded third-party frame. camera stays closed:
            // the photo/video prompts use a file input with `capture`, which hands
            // off to the phone's own camera app and is not gated by this header.
            value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
