import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'

import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { resourceGuides } from '../lib/seo/resources'
import { SITE_URL } from '../lib/site'
import proxy from '../proxy'

test('publishes only canonical, public URLs in the sitemap', () => {
  const urls = sitemap().map((entry) => entry.url)

  const expectedStaticUrls = [
    SITE_URL,
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
})

test('advertises the canonical sitemap and keeps private areas out of crawl results', () => {
  const metadata = robots()
  const rules = Array.isArray(metadata.rules) ? metadata.rules[0] : metadata.rules

  assert.equal(metadata.host, SITE_URL)
  assert.equal(metadata.sitemap, `${SITE_URL}/sitemap.xml`)
  assert.ok(rules?.disallow?.includes('/dashboard'))
  assert.ok(rules?.disallow?.includes('/settings'))
  assert.ok(rules?.allow?.includes('/api/og'))
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
