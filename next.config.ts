import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   allowedDevOrigins: ['3000-cs-5709ceaf-4394-4074-8982-ee7761459a04.cs-asia-southeast1-ajrg.cloudshell.dev'],
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
