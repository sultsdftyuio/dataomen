import { Cookie } from "lucide-react";

import {
  LegalDefinitions,
  LegalDocument,
  LegalEmail,
  LegalLink,
  Term,
  type LegalSection,
} from "@/components/legal/legal-document";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

// Keep this list in step with the code: the Supabase session cookie
// (utils/supabase), the sidebar preference cookie (components/ui/sidebar.tsx),
// reply drafts in local storage (components/prospects/lead-outreach.tsx), and
// Vercel Web Analytics (app/layout.tsx). Adding any non-essential cookie or
// tracker requires updating this page and adding a consent choice first.

export const metadata = publicPageMetadata(
  "/cookies",
  "Cookie Policy | Arcli",
  "How Arcli uses essential cookies and similar storage technologies.",
);

const summary = [
  "We use a small number of cookies, all needed to keep you signed in and to run the dashboard.",
  "We do not use advertising cookies or trackers that follow you across other websites.",
  "Our usage analytics do not set cookies.",
];

const sections: LegalSection[] = [
  {
    id: "what-these-are",
    title: "What cookies and browser storage are",
    content: (
      <>
        <p>A cookie is a small file a website stores in your browser so it can recognise you on your next request. Browser storage, such as local storage, works in a similar way but stays on your device and is not sent with every request. This policy covers both.</p>
      </>
    ),
  },
  {
    id: "what-we-use",
    title: "What we use",
    content: (
      <>
        <p>Everything below is essential: the Service does not work, or loses your preferences, without it. Because of that, we do not ask for consent to set it.</p>
        <LegalDefinitions
          items={[
            {
              term: "Sign-in session cookie",
              description:
                "Keeps you signed in and lets the dashboard confirm it is you. Set when you sign in and refreshed while you use the Service; removed when you sign out.",
            },
            {
              term: "Sidebar preference cookie",
              description:
                "Remembers whether you left the dashboard sidebar open or collapsed. Kept for 7 days.",
            },
            {
              term: "Integration security cookie",
              description:
                "A short-lived cookie set only while you connect an integration, to confirm the connection was started by you.",
            },
            {
              term: "Network security cookies",
              description:
                "Our network security provider may set cookies it needs to tell real visitors from automated traffic.",
            },
            {
              term: "Reply drafts in local storage",
              description:
                "If you edit a suggested reply, the draft is saved on your device so it is not lost if you close the page. It stays in your browser until you clear it.",
            },
          ]}
        />
      </>
    ),
  },
  {
    id: "analytics",
    title: "Analytics",
    content: (
      <>
        <p>We use a privacy-focused analytics service to count page views and a small set of product actions, such as a result being opened. It does not set cookies, and we do not use it to follow you across other websites or to build an advertising profile. The product actions we record never include post text, authors, or links.</p>
      </>
    ),
  },
  {
    id: "advertising",
    title: "Advertising and tracking",
    content: (
      <>
        <p>We do not use advertising cookies, social media pixels, or cross-site trackers, and we do not sell information about your browsing.</p>
        <p><Term>If this changes.</Term> Before adding any non-essential cookie or tracker, we will update this policy and ask for your consent where the law requires it.</p>
      </>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices",
    content: (
      <>
        <p>You can block or delete cookies and clear local storage in your browser settings. Blocking essential cookies prevents you from signing in. Deleting them signs you out and resets your preferences, and clearing local storage removes saved reply drafts.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Changes and contact",
    content: (
      <>
        <p>We update this policy when what we store in your browser changes; the date at the top shows the latest version. For how we handle personal information more generally, see our <LegalLink href="/privacy">Privacy Policy</LegalLink>. Questions can be sent to <LegalEmail />.</p>
      </>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocument
      icon={Cookie}
      title="Arcli Cookie Policy"
      intro={
        <p>This policy explains what Arcli stores in your browser, why, and how you can control it.</p>
      }
      summary={summary}
      sections={sections}
      related={[
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms of Service" },
      ]}
    />
  );
}
