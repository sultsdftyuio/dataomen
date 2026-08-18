import assert from 'node:assert/strict'
import test from 'node:test'

import robots from '../app/robots'
import sitemap from '../app/sitemap'
import { SITE_URL } from '../lib/site'

test('publishes only canonical, public URLs in the sitemap', () => {
  const urls = sitemap().map((entry) => entry.url)

  assert.deepEqual(urls, [
    SITE_URL,
    `${SITE_URL}/security`,
    `${SITE_URL}/privacy`,
    `${SITE_URL}/privacy/remove`,
    `${SITE_URL}/terms`,
    `${SITE_URL}/cookies`,
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
