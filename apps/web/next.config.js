/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Performance optimizations
  swcMinify: true,
  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports — strips barrel files so dev only compiles the
    // icons/components/charts actually used instead of each whole package.
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'recharts',
    ],
    // Keep these packages external so Node can resolve runtime deps used by ODIS.
    serverComponentsExternalPackages: [
      '@celo/identity',
      '@celo/blind-threshold-bls',
      '@celo/phone-number-privacy-common',
      '@celo/poprf',
    ],
  },
  // Compiler optimizations.
  // Turbopack (dev) doesn't support `compiler.removeConsole`, so only apply it
  // for the webpack production build (`next build`). TURBOPACK is set by
  // `next dev --turbo`.
  ...(process.env.TURBOPACK
    ? {}
    : {
        compiler: {
          removeConsole:
            process.env.NODE_ENV === 'production'
              ? { exclude: ['error', 'warn'] }
              : false,
        },
      }),
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')

    // Handle better-sqlite3 for Next.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Privy / WalletConnect pull in RN async storage; not needed for web builds
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    
    return config
  },
};

module.exports = nextConfig;
