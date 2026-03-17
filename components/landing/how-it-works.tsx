'use client';

import { FileUp, MessageSquare, Bot } from 'lucide-react';
import { C } from "@/lib/tokens";

const steps = [
  {
    id: "01",
    title: "Connect Your Data",
    description: "Upload a CSV or connect your live database (Postgres, Stripe, Snowflake) in seconds. Arcli instantly maps your schema for analysis.",
    icon: <FileUp className="w-6 h-6" style={{ color: C.blue }} />
  },
  {
    id: "02",
    title: "Ask in Plain English",
    description: "No SQL required. Just type your questions and Arcli’s AI analyst writes the queries for you, rendering interactive charts instantly.",
    icon: <MessageSquare className="w-6 h-6" style={{ color: C.blue }} />
  },
  {
    id: "03",
    title: "Deploy AI Agents",
    description: "Turn your questions into autonomous watchdogs. Deploy AI agents that monitor your metrics 24/7 and alert you to anomalies in real-time.",
    icon: <Bot className="w-6 h-6" style={{ color: C.blue }} />
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="pfd" style={{ fontSize: 42, color: C.navy, marginBottom: 16 }}>
            How Arcli Works
          </h2>
          <p style={{ fontSize: 18, color: C.muted, maxWidth: 600, margin: "0 auto" }}>
            From raw data to autonomous AI monitoring in three simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line for desktop */}
          <div 
            className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 z-0"
            style={{ background: C.rule }}
          ></div>

          {steps.map((step, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center text-center">
              <div 
                className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-6 relative"
                style={{ border: `4px solid ${C.offWhite}` }}
              >
                {step.icon}
                <div 
                  className="absolute -bottom-2 -right-2 w-8 h-8 font-bold rounded-full flex items-center justify-center text-sm border-2 border-white"
                  style={{ background: C.bluePale, color: C.blue }}
                >
                  {step.id}
                </div>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.6 }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}