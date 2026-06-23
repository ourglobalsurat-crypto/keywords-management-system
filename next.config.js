/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep the RAR (WASM) extractor un-bundled and require it at runtime,
    // and make sure its .wasm ships in the serverless function output.
    serverComponentsExternalPackages: ["node-unrar-js"],
    outputFileTracingIncludes: {
      "/api/sem/upload": ["./node_modules/node-unrar-js/**/*.wasm"],
    },
  },
};

module.exports = nextConfig;
