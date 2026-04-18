import Link from "next/link";

type DocsPageProps = {
  params: {
    slug?: string[];
  };
};

const QUICK_LINKS = [
  {
    href: "/docs/security/ip-allowlist",
    title: "IP Allowlist",
    description: "Trusted source ranges and network access guidance.",
  },
  {
    href: "/docs/security/required-permissions",
    title: "Required Permissions",
    description: "Minimum read-only permissions for warehouse connectors.",
  },
  {
    href: "/docs/troubleshooting/database-sleep",
    title: "Database Sleep Troubleshooting",
    description: "How to wake paused databases and avoid timeout errors.",
  },
  {
    href: "/docs/troubleshooting/ssl",
    title: "SSL Troubleshooting",
    description: "TLS and certificate checks for stable connector handshakes.",
  },
];

export default function DocsPage({ params }: DocsPageProps) {
  const slug = params.slug ?? [];
  const currentPath = slug.length > 0 ? `/${slug.join("/")}` : "/";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Documentation</p>
        <h1 className="text-4xl font-black tracking-tight text-slate-900">DataOmen Support Docs</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          This documentation route is active. Requested path:
          <span className="ml-1 rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{currentPath}</span>
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
          >
            <p className="text-base font-semibold text-slate-900">{item.title}</p>
            <p className="mt-2 text-sm text-slate-600">{item.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
