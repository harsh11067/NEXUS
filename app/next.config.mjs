/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@nexus/sdk"],
  serverExternalPackages: [
    "@0gfoundation/0g-storage-ts-sdk",
    "@0gfoundation/0g-compute-ts-sdk",
    "eciesjs",
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  webpack: (config) => {
    // the @nexus/sdk source uses ".js" ESM specifiers that point at ".ts"
    // files — let webpack resolve them the way tsx/node ESM does.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
