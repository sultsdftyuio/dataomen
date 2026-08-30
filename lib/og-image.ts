export const OG_IMAGE_PATH = '/api/og';

const DEFAULT_OG_TITLE = 'Buyer Intent Discovery for B2B Founders';
const MAX_TITLE_LENGTH = 140;

export type OgImageType = 'default' | 'security';

function normalizeTitle(value: string | null | undefined): string {
  const title = value?.replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, MAX_TITLE_LENGTH) : DEFAULT_OG_TITLE;
}

function normalizeType(value: string | null | undefined): OgImageType {
  return value === 'security' ? 'security' : 'default';
}

function splitLegacyEscapedType(title: string | null): {
  title: string | null;
  type: OgImageType | null;
} {
  if (!title) return { title, type: null };

  // Older metadata serializers occasionally turned the query separator into
  // the literal text `u0026`, leaving a stale URL such as
  // `/og?title=Security...u0026type=security`. Treat only the exact trailing
  // `type` fragment as legacy query syntax; ordinary title text is untouched.
  const match = title.match(/(?:\\?u0026|&)type=(security|default)$/i);
  if (!match) return { title, type: null };

  return {
    title: title.slice(0, match.index).trim(),
    type: normalizeType(match[1].toLowerCase()),
  };
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
  const legacy = splitLegacyEscapedType(url.searchParams.get('title'));
  return {
    title: normalizeTitle(legacy.title),
    // A real query parameter always wins over a malformed legacy suffix.
    type: normalizeType(url.searchParams.get('type') ?? legacy.type),
  };
}
