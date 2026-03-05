'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Is my data secure?",
    answer: "Absolutely. We utilize Supabase Row Level Security (RLS) for strict multi-tenant isolation. Your datasets are stored securely and only accessible via read-only analytical connections specific to your tenant ID."
  },
  {
    question: "What file formats do you support?",
    answer: "You can upload standard CSV or JSON files. Under the hood, our data sanitizer automatically converts them into optimized, columnar Parquet formats for lightning-fast querying."
  },
  {
    question: "How does the AI understand my data?",
    answer: "We use a contextual RAG (Retrieval-Augmented Generation) pipeline. When you ask a question, we only send the relevant schema fragments to the LLM. This prevents hallucinations and ensures the generated SQL is perfectly tailored to your dataset."
  },
  {
    question: "Can it handle millions of rows?",
    answer: "Yes. By utilizing an in-process DuckDB engine and vectorized Python operations (Pandas/NumPy) for anomaly detection, we move the compute directly to the data layer, allowing you to analyze massive datasets in milliseconds."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 bg-white/[0.01] border-y border-white/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          <p className="text-slate-400 text-lg">Everything you need to know about the platform.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div 
                key={i} 
                className="border border-white/10 bg-white/[0.02] rounded-2xl overflow-hidden transition-all duration-300"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
                >
                  <span className="text-lg font-medium text-white">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <div 
                  className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-slate-400 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}