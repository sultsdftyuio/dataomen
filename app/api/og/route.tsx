import { ImageResponse } from 'next/og';

import { getOgImageParams } from '@/lib/og-image';

export const runtime = 'edge';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
};

export function GET(request: Request) {
  const { title, type } = getOgImageParams(request.url);
  const isSecurity = type === 'security';

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'flex-start',
          background: isSecurity
            ? 'linear-gradient(135deg, #071a35 0%, #0b2b55 100%)'
            : 'linear-gradient(135deg, #06142b 0%, #0f3a66 100%)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: '72px',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: '-1px' }}>
          arcli<span style={{ color: '#60a5fa' }}>.</span>tech
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: '960px' }}>
          <div style={{ color: '#93c5fd', display: 'flex', fontSize: 26, fontWeight: 600 }}>
            {isSecurity ? 'SECURITY & GDPR' : 'FIND NEW CUSTOMERS'}
          </div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, letterSpacing: '-3px', lineHeight: 1.08 }}>
            {title}
          </div>
        </div>
        <div style={{ color: '#bfdbfe', display: 'flex', fontSize: 24 }}>
          Find people already looking for what you offer.
        </div>
      </div>
    ),
    {
      ...size,
      headers: CACHE_HEADERS,
    },
  );
}
