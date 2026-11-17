import { brand } from "@/config/brand";
import { faqs } from "@/config/marketing";

/** Renders structured data for Google. "<" is escaped so text can never close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

const ORG_ID = `${brand.url}/#organization`;

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: brand.name,
    legalName: brand.parentCompany,
    url: brand.url,
    logo: `${brand.url}/icon.png`,
    email: brand.email.support,
    address: { "@type": "PostalAddress", addressLocality: "Kumasi", addressCountry: "GH" },
    areaServed: { "@type": "Country", name: "Ghana" },
    sameAs: brand.socials.map((s) => s.href),
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${brand.url}/#website`,
    name: brand.name,
    url: brand.url,
    inLanguage: "en-GH",
    publisher: { "@id": ORG_ID },
  };
}

/** The product itself. Only the free plan carries a price: paid prices are edited in SuperAdmin and would drift. */
export function softwareLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Church management software",
    operatingSystem: "Web, Android, iOS, Windows, macOS",
    url: brand.url,
    description,
    publisher: { "@id": ORG_ID },
    offers: { "@type": "Offer", name: "Free plan", price: "0", priceCurrency: "GHS" },
  };
}

/** The same questions and answers the FAQ section shows, with the live price and member limit filled in. */
export function faqLd(starterPrice: string, freeMembers: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a.replace("{PRICE}", starterPrice).replace("{FREE_MEMBERS}", freeMembers),
      },
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${brand.url}${it.path}`,
    })),
  };
}
