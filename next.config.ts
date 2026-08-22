import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and mammoth ships CJS with dynamic
  // requires. Both must stay external to the server bundle.
  serverExternalPackages: ['better-sqlite3', 'mammoth'],
};

export default nextConfig;
