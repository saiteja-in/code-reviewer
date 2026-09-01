import { getSiteUrl, siteConfig } from "@/lib/site";

type JsonLdGraph = Record<string, unknown>[];

export function getHomeJsonLd(): JsonLdGraph {
  const siteUrl = getSiteUrl();

  return [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteConfig.name,
      description: siteConfig.seoDescription,
      inLanguage: "en-US",
    },
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/#webpage`,
      url: siteUrl,
      name: siteConfig.seoTitle,
      description: siteConfig.seoDescription,
      isPartOf: { "@id": `${siteUrl}/#website` },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: siteConfig.name,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description: siteConfig.description,
      url: siteUrl,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Automated GitHub pull request reviews",
        "GitHub App check runs",
        "Risk scores and inline PR comments",
        "Manual and webhook-triggered reviews",
      ],
    },
  ];
}

export function JsonLd({ data }: { data: JsonLdGraph }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": data,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
