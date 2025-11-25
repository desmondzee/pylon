/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure proper module resolution for @supabase/ssr
  transpilePackages: ['@supabase/ssr'],
}

module.exports = nextConfig
