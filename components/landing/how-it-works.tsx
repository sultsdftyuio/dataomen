'use client';

import { UploadCloud, Cpu, LineChart } from 'lucide-react';

const steps = [
  {
    id: 1,
    title: "Ingest & Sanitize",
    description: "Upload raw CSVs or connect your DB. Our Data Sanitizer cleanses schemas and converts data to optimized Parquet formats stored in Cloudflare R2.",
    icon: <UploadCloud className="w-8 h-8 text-indigo-600" />
  },
  {
    id: 2,
    title: "Vectorized Computation",
    description: "DuckDB executes massive aggregations in-memory, while background Python watchdog services calculate EMAs and moving variances using NumPy.",
    icon: <Cpu className="w-8 h-8 text-indigo-600" />
  },
  {
    id: 3,
    title: "Interact & Visualize",
    description: "The UI instantly renders insights via Next.js components. Use the semantic router to chat with your data and generate custom charts dynamically.",
    icon: <LineChart className="w-8 h-8 text-indigo-600" />
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-slate-50 relative border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">The Modular Pipeline</h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-lg">
            A look under the hood at how data flows securely from ingestion to insight.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.id} className="relative p-8 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="absolute -top-5 -left-5 w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center font-bold text-white border-4 border-slate-50 shadow-sm z-10">
                {step.id}
              </div>
              <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 inline-block rounded-xl">
                {step.icon}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">{step.title}</h3>
              <p className="text-slate-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}