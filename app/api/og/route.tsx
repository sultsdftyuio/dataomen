import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// 1. Hybrid Performance Paradigm: Run at the edge for ultra-low latency globally
export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Extract dynamically injected params from your programmatic SEO pages
    const title = searchParams.get('title') || 'DataOmen - Autonomous Data Department';
    const type = searchParams.get('type') || 'Platform';

    // 2. Functional & Vectorized Logic: Using basic CSS capabilities to 
    // construct a high-performance SVG payload returned as a PNG
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
            // Brutalist / Modern grid pattern matching your dark theme
            backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.1) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255, 255, 255, 0.1) 2%, transparent 0%)',
            backgroundSize: '100px 100px',
            padding: '80px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Dynamic Category/Type Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 28px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
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
              fontSize: title.length > 40 ? 64 : 76, // Auto-scale typography
              fontFamily: 'sans-serif',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              color: 'white',
              lineHeight: 1.1,
              maxWidth: '900px',
              marginBottom: '60px',
            }}
          >
            {title}
          </div>

          {/* Brand Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 'auto',
            }}
          >
            {/* Minimalist DataOmen Logo approximation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: 16,
                background: '#3b82f6',
                marginRight: 24,
                boxShadow: '0 0 40px rgba(59, 130, 246, 0.4)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'white', fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>DataOmen</span>
              <span style={{ color: '#a3a3a3', fontSize: 20, fontWeight: 500 }}>Turn data into instant insights.</span>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        // Optional: Can add custom fonts (like your Geist font) here by passing an ArrayBuffer to 'fonts'
      }
    );
  } catch (e: any) {
    console.error(`Failed to generate the OG image: ${e.message}`);
    // Fallback response for resilience
    return new Response(`Failed to generate image`, { status: 500 });
  }
}