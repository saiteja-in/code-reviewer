import type { Metadata } from "next";
import { getGoogleSiteVerification, getSiteUrl, siteConfig } from "@/lib/site";

type CreateMetadataOptions = {
  title?: string;
  /** Bypasses the root title template — use on the homepage. */
  absoluteTitle?: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
};

export function createMetadata({
  title,
  absoluteTitle,
  description = siteConfig.description,
  path = "",
  noIndex = false,
}: CreateMetadataOptions = {}): Metadata {
  const url = `${getSiteUrl()}${path}`;
  const documentTitle =
    absoluteTitle ?? (title ? `${title} | ${siteConfig.name}` : siteConfig.name);

  return {
    ...(absoluteTitle
      ? { title: { absolute: absoluteTitle } }
      : title
        ? { title }
        : {}),
    description,
    keywords: [...siteConfig.keywords],
    ...(noIndex
      ? { robots: { index: false, follow: false } }
      : { alternates: { canonical: url } }),
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName: siteConfig.name,
      title: documentTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: documentTitle,
      description,
    },
  };
}

const siteUrl = getSiteUrl();

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  category: "technology",
  creator: siteConfig.name,
  publisher: siteConfig.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: siteConfig.name,
    title: siteConfig.seoTitle,
    description: siteConfig.seoDescription,
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.seoTitle,
    description: siteConfig.seoDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  ...(getGoogleSiteVerification()
    ? { verification: { google: getGoogleSiteVerification() } }
    : {}),
};

export const privateMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};
