// app/not-found.tsx

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, LifeBuoy } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white relative overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      
      {/* Subtle background glow for depth (Minimalist Gradient) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-50/60 rounded-full blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto w-full">
        
        {/* Large Bold Typography - 404 */}
        <h1 className="text-[10rem] font-extrabold text-slate-900 tracking-tighter leading-none mb-6 drop-shadow-sm">
          404
        </h1>

        {/* Deep Navy Primary Text */}
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-4">
          Page not found
        </h2>

        {/* Clean, readable description */}
        <p className="text-lg text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
          The page you are looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        {/* Action Buttons - Sharp blue for primary action, lightweight for secondary */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
          
          <Button 
            asChild 
            size="lg" 
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-300 rounded-full px-8 h-12 text-base w-full sm:w-auto group"
          >
            <Link href="/">
              <Home className="w-5 h-5 mr-2 group-hover:-translate-y-0.5 transition-transform" />
              Return Home
            </Link>
          </Button>

          <Button 
            asChild 
            variant="outline" 
            size="lg" 
            className="border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm hover:shadow transition-all duration-300 rounded-full px-8 h-12 text-base w-full sm:w-auto bg-white"
          >
            <Link href="mailto:support@arcli.tech">
              <LifeBuoy className="w-5 h-5 mr-2 text-blue-600" />
              Contact Support
            </Link>
          </Button>

        </div>
      </main>

      {/* Uncluttered Footer Note */}
      <footer className="absolute bottom-8 left-0 right-0 text-center text-slate-400 text-sm font-medium tracking-wide">
        <p>© {new Date().getFullYear()} arcli.tech. All rights reserved.</p>
      </footer>
    </div>
  );
}