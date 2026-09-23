/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
  webpack: (config) => {
    // face-api.js/tfjs bundle optional Node-only branches (fs, encoding) that
    // are never executed in the browser; silence the harmless warnings.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, encoding: false };
    return config;
  },
};
export default nextConfig;
