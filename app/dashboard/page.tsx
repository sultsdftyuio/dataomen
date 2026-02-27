// app/dashboard/page.tsx
"use client";

import React, { useState } from "react";
import { UploadCloud, MessageSquare, Database, Loader2 } from "lucide-react";

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [sqlExecuted, setSqlExecuted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // In production, grab tenant_id via your auth provider (e.g., Clerk)
  const MOCK_TENANT_ID = "mock-tenant-123";

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Connects to our Modular backend routes
      const res = await fetch(`http://localhost:10000/api/v1/datasets/upload`, {
        method: "POST",
        headers: { "X-Tenant-ID": MOCK_TENANT_ID },
        body: formData,
      });
      const data = await res.json();
      setActiveDatasetId(data.id);
      alert("File Processed & Parquet Created Successfully!");
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDatasetId || !query) return;
    setLoading(true);

    try {
      const res = await fetch(`http://localhost:10000/api/v1/narrative/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": MOCK_TENANT_ID,
        },
        body: JSON.stringify({ dataset_id: activeDatasetId, query }),
      });
      const data = await res.json();
      setResults(data.data);
      setSqlExecuted(data.sql_executed);
    } catch (error) {
      console.error("Query failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center space-x-3">
          <Database className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Analytical Engine</h1>
        </header>

        {/* Upload Zone */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-gray-500" /> Ingest Data
          </h2>
          <form onSubmit={handleUpload} className="flex gap-4 items-center">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              type="submit"
              disabled={!file || loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Process Vector"}
            </button>
          </form>
          {activeDatasetId && (
            <p className="text-sm text-green-600 mt-3 font-medium">
              Active Dataset ID: {activeDatasetId}
            </p>
          )}
        </section>

        {/* Natural Language Query Zone */}
        <section className={`bg-white p-6 rounded-xl shadow-sm border border-gray-200 ${!activeDatasetId && "opacity-50 pointer-events-none"}`}>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-500" /> Contextual RAG Query
          </h2>
          <form onSubmit={handleQuery} className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., What is the sum of revenue grouped by region?"
              className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gray-900 text-white px-6 py-2 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              Generate Insight
            </button>
          </form>

          {/* Results Display */}
          {sqlExecuted && (
            <div className="mt-6 bg-gray-100 p-4 rounded-md text-sm font-mono text-gray-700 overflow-x-auto">
              <strong>DuckDB SQL Executed:</strong>
              <pre className="mt-2 text-blue-600">{sqlExecuted}</pre>
            </div>
          )}

          {results && (
            <div className="mt-6 overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(results[0] || {}).map((key) => (
                      <th key={key} className="px-4 py-3 font-medium text-gray-900">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {results.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val: any, j) => (
                        <td key={j} className="px-4 py-3 text-gray-600">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}