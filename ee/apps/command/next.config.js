import { join } from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: (config) => {
    config.externals.push('@node-rs/argon2', '@node-rs/bcrypt');
    return config;
  },
  output: 'standalone',
  images: {
    unoptimized: true
  },
  experimental: {
    outputFileTracingRoot: join(
      new URL('.', import.meta.url).pathname,
      '../../../'
    )
  }
};

export default nextConfig;
