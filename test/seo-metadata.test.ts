import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { resourceGuides } from '../lib/seo/resources'
import { resourceStructuredData } from '../lib/seo/resource-schema'
import { publicPageMetadata } from '../lib/seo/public-metadata'
import { SITE_URL } from '../lib/site'
import proxy from '../proxy'

test('publishes only canonical, public URLs in the sitemap', () => {
  const entries = sitemap()
  const urls = entries.map((entry) => entry.url)

  const expectedStaticUrls = [
    `${SITE_URL}/`,
    `${SITE_URL}/security`,
    `${SITE_URL}/privacy`,
    `${SITE_URL}/privacy/remove`,
    `${SITE_URL}/terms`,
    `${SITE_URL}/cookies`,
  ]

  assert.deepEqual(urls, [
    ...expectedStaticUrls,
    `${SITE_URL}/resources`,
    ...resourceGuides.map((guide) => `${SITE_URL}${guide.path}`),
  ])
  assert.ok(urls.every((url) => url.startsWith(SITE_URL)))
  assert.ok(urls.every((url) => !url.includes('saas-churn-')))
  assert.ok(entries.every((entry) => !('priority' in entry) && !('changeFrequency' in entry)))
})

test('advertises the canonical sitemap and keeps private areas out of crawl results', () => {
  const metadata = robots()
  const rules = Array.isArray(metadata.rules) ? metadata.rules[0] : metadata.rules

  assert.equal(metadata.host, SITE_URL)
  assert.equal(metadata.sitemap, `${SITE_URL}/sitemap.xml`)
  assert.ok(rules?.disallow?.includes('/dashboard'))
  assert.ok(rules?.disallow?.includes('/settings'))
  assert.ok(rules?.allow?.includes('/api/og'))
  assert.ok(!rules?.disallow?.includes('/pilot'))
  assert.ok(!rules?.disallow?.includes('/login'))
  assert.ok(!rules?.disallow?.includes('/_next/image/'))
})

test('describes resource articles without retired FAQ rich-result markup', () => {
  for (const guide of resourceGuides) {
    const schema = resourceStructuredData(guide)
    const article = schema['@graph'].find((item) => item['@type'] === 'Article')

    assert.ok(article)
    assert.equal(article.mainEntityOfPage, `${SITE_URL}${guide.path}`)
    assert.ok(article.image?.[0].startsWith(SITE_URL))
    assert.ok(!schema['@graph'].some((item) => item['@type'] === 'FAQPage'))
  }
})

test('keeps resource search snippets within the requested limits', () => {
  for (const guide of resourceGuides) {
    assert.ok(guide.seoTitle.length < 60, guide.path)
    assert.ok(guide.description.length < 160, guide.path)
    assert.match(guide.seoTitle, /B2B|Buyer|Conversation/)
  }
})

test('sets unique canonical and social URLs on public policy pages', () => {
  const page = publicPageMetadata('/privacy', 'Privacy Policy | Arcli', 'How Arcli handles account information.')

  assert.equal(page.alternates?.canonical, `${SITE_URL}/privacy`)
  assert.equal(page.openGraph?.url, `${SITE_URL}/privacy`)
  assert.ok(page.twitter && 'card' in page.twitter)
  assert.equal(page.twitter.card, 'summary_large_image')
})

test('serves a single main heading and complete snippets in the landing export', () => {
  const html = readFileSync(new URL('../public/landing/index.html', import.meta.url), 'utf8')
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1]

  assert.ok(title && title.length < 60)
  assert.ok(description && description.length < 160)
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
  assert.equal((html.match(/<main\b/g) ?? []).length, 1)
  assert.match(html, /<meta name="twitter:description"/)
  assert.match(html, /"@type":"Organization"/)
  assert.match(html, /"@type":"WebSite"/)
  assert.doesNotMatch(html, /"@type":"SoftwareApplication"/)
})

test('redirects the apex host to the canonical www host', async () => {
  const response = await proxy(new NextRequest('https://arcli.tech/resources'))

  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://www.arcli.tech/resources')
})

test('keeps resource pages on the public, cacheable route', async () => {
  const response = await proxy(
    new NextRequest('https://www.arcli.tech/resources/buyer-intent-signals'),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), null)
})
