'use client';

export function Testimonials() {
  const reviews = [
    {
      quote: "The anomaly detection agents caught a silent drop in our MRR that our standard dashboards missed completely. It's like having a team watching our data 24/7.",
      author: "Sarah J.",
      role: "Head of Growth"
    },
    {
      quote: "Being able to just ask 'What were the top selling products in Europe last week' and getting an instant, interactive chart backed by DuckDB is pure magic.",
      author: "Marcus T.",
      role: "Data Analyst"
    },
    {
      quote: "The fact that it runs in-process means we aren't paying massive warehouse compute costs for simple queries. The architecture here is incredibly smart.",
      author: "David L.",
      role: "Lead Engineer"
    }
  ];

  return (
    <section className="py-24 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Loved by data teams</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reviews.map((review, i) => (
            <div key={i} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <p className="text-slate-700 italic mb-6 leading-relaxed">"{review.quote}"</p>
              <div>
                <p className="font-bold text-slate-900">{review.author}</p>
                <p className="text-sm text-slate-500">{review.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}