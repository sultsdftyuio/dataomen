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
    question: "How do the AI Agents work?",
    answer: "Agents are background Python watchdogs. You deploy them against a specific dataset, and they use vectorized Pandas/NumPy operations to calculate Exponential Moving Averages (EMA) and variance, alerting you automatically if anomalies occur."
  },
  {
    question: "How does the AI understand my data?",
    answer: "We use a contextual RAG (Retrieval-Augmented Generation) pipeline. When you ask a question, we only send the relevant schema fragments to the LLM. This prevents hallucinations and ensures the generated SQL is perfectly tailored to your dataset."
  },
  {
    question: "Can it handle millions of rows?",
    answer: "Yes. By utilizing an in-process DuckDB engine querying optimized Parquet formats, we move the compute directly to the data layer, allowing you to analyze massive datasets in milliseconds."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 bg-white border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div 
                key={i} 
                className="border border-slate-200 bg-slate-50 rounded-2xl overflow-hidden transition-all duration-300"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left focus:outline-none hover:bg-slate-100 transition-colors"
                >
                  <span className="text-lg font-bold text-slate-900">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <div 
                  className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-slate-600 leading-relaxed">
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