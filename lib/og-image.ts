export const OG_IMAGE_PATH = '/api/og';

const DEFAULT_OG_TITLE = 'Arcli | SaaS Churn Recovery Platform';
const MAX_TITLE_LENGTH = 140;

export type OgImageType = 'default' | 'security';

function normalizeTitle(value: string | null | undefined): string {
  const title = value?.replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, MAX_TITLE_LENGTH) : DEFAULT_OG_TITLE;
}

function normalizeType(value: string | null | undefined): OgImageType {
  return value === 'security' ? 'security' : 'default';
}

/**
 * Produces a relative, correctly encoded URL for the Next.js Open Graph route.
 * Keeping this construction in one place prevents JSON-escaped ampersands
 * (for example, `u0026`) from becoming part of the title query parameter.
 */
export function createOgImageUrl(title?: string, type?: string): string {
  const params = new URLSearchParams({ title: normalizeTitle(title) });
  const normalizedType = normalizeType(type);

  if (normalizedType !== 'default') {
    params.set('type', normalizedType);
  }

  return `${OG_IMAGE_PATH}?${params.toString()}`;
}

export function getOgImageParams(requestUrl: string): {
  title: string;
  type: OgImageType;
} {
  const url = new URL(requestUrl);
  return {
    title: normalizeTitle(url.searchParams.get('title')),
    type: normalizeType(url.searchParams.get('type')),
  };
}
