import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/sign-in",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/sign-up",
        destination: "/login",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
