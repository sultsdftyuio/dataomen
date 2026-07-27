import assert from 'node:assert/strict';
import test from 'node:test';

import { createOgImageUrl, getOgImageParams } from '../lib/og-image';

test('creates an Open Graph URL using a real query-string separator', () => {
  const url = createOgImageUrl('Security and GDPR for AI Analytics', 'security');

  assert.equal(
    url,
    '/api/og?title=Security+and+GDPR+for+AI+Analytics&type=security',
  );
  assert.ok(!url.includes('u0026'));
});

test('normalizes and bounds image query parameters', () => {
  const params = getOgImageParams(
    'https://arcli.tech/api/og?title=%20Security%20%20and%20GDPR%20&type=unknown',
  );

  assert.deepEqual(params, {
    title: 'Security and GDPR',
    type: 'default',
  });
});
