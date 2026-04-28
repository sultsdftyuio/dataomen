// app/(dashboard)/layout.tsx
import React from "react"

export default function SimpleDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Centered, high-density focus area. No sidebars, no distracting nav. */}
      <main className="w-full max-w-3xl animate-in fade-in duration-500">
        {children}
      </main>
    </div>
  )
}