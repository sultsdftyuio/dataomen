// app/api/og/route.tsx
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// 1. Hybrid Performance Paradigm: Run at the edge for ultra-low latency globally
export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Extract dynamically injected params from your programmatic SEO pages
    const title = searchParams.get('title') || 'Arcli - Autonomous Data Engine';
    const type = searchParams.get('type') || 'Platform';
    
    // PHASE 4 INJECTION: Capture the SQL/Code snippet from the page parser
    const code = searchParams.get('code');

    // Typography scaling logic based on spatial constraints
    const titleFontSize = code ? (title.length > 40 ? 56 : 64) : (title.length > 50 ? 64 : 76);

    // 2. Functional & Vectorized Logic: Constructing a high-performance SVG payload
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0B1221', // Deep Navy from your UI parser
            backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.05) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255, 255, 255, 0.03) 2%, transparent 0%)',
            backgroundSize: '100px 100px',
            padding: '80px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Left Column: Text & Branding */}
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100%', 
              justifyContent: 'space-between', 
              paddingRight: code ? '60px' : '0',
              // Satori Optimization: Explicit widths prevent layout collapse
              width: code ? '55%' : '100%', 
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              {/* Dynamic Category/Type Badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 28px',
                  backgroundColor: 'rgba(37, 99, 235, 0.15)', // Sharp Blue #2563eb
                  border: '1px solid rgba(37, 99, 235, 0.4)',
                  borderRadius: '100px',
                  marginBottom: '40px',
                }}
              >
                <span style={{ color: '#60a5fa', fontSize: 24, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.05em' }}>
                  {type}
                </span>
              </div>

              {/* Dynamic H1 Title */}
              <div
                style={{
                  display: 'flex',
                  fontSize: titleFontSize,
                  fontFamily: 'sans-serif',
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  color: 'white',
                  lineHeight: 1.1,
                }}
              >
                {title}
              </div>
            </div>

            {/* Brand Footer */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: '#2563eb',
                  marginRight: 24,
                  boxShadow: '0 0 40px rgba(37, 99, 235, 0.4)',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: 'white', fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>Arcli</span>
                <span style={{ color: '#94a3b8', fontSize: 20, fontWeight: 500 }}>Turn data into instant insights.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Code Injection Window */}
          {code && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '45%',
                height: '470px',
                backgroundColor: '#020617', // Deep IDE background
                borderRadius: '24px',
                border: '1px solid #1e293b',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                overflow: 'hidden',
              }}
            >
              {/* IDE Header (macOS style dots) */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '6px', backgroundColor: '#ef4444' }} />
                  <div style={{ width: '12px', height: '12px', borderRadius: '6px', backgroundColor: '#f59e0b' }} />
                  <div style={{ width: '12px', height: '12px', borderRadius: '6px', backgroundColor: '#10b981' }} />
                </div>
                <div style={{ display: 'flex', marginLeft: 'auto', color: '#64748b', fontSize: '14px', fontFamily: 'monospace', fontWeight: 600 }}>
                  sys.engine_query
                </div>
              </div>
              
              {/* IDE Body (SQL Output) */}
              <div style={{ display: 'flex', padding: '32px 24px', flexDirection: 'column' }}>
                <div
                  style={{
                    color: '#38bdf8', // Neon blue SQL text for contrast
                    fontSize: 24,
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    fontWeight: 600,
                  }}
                >
                  {code.slice(0, 180)}{code.length > 180 ? '...' : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    console.error(`Failed to generate the OG image: ${e.message}`);
    
    // Graceful Degradation: Avoid sending a 500 error, which causes a broken image 
    // icon on Twitter/Slack. Return a safe, minimalist branded fallback instead.
    return new ImageResponse(
      (
        <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1221' }}>
           <span style={{ color: 'white', fontSize: 72, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'sans-serif' }}>Arcli Data Platform</span>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}