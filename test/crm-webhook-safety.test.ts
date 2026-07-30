import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import test from "node:test";

import {
  CRM_WEBHOOK_MAX_RESPONSE_BYTES,
  deliverCrmWebhook,
} from "../lib/crm-webhook-delivery";
import {
  isPublicRoutableAddress,
  localWebhookTestingEnabled,
  type WebhookAddress,
  validateWebhookDestination,
} from "../lib/crm-webhook-destination";

const publicLookup = async (): Promise<ReadonlyArray<WebhookAddress>> => [
  { address: "8.8.8.8", family: 4 },
];

type LocalServerHandler = (
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
) => void;

async function withLocalServer(
  handler: LocalServerHandler,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Local webhook test server did not expose a TCP port.");
  }

  try {
    await run(address.port);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("webhook destinations require HTTPS in production and reject URL credentials", async () => {
  let lookupCalls = 0;
  const lookup = async (): Promise<ReadonlyArray<WebhookAddress>> => {
    lookupCalls += 1;
    return publicLookup();
  };

  assert.equal(
    await validateWebhookDestination("http://crm.example.test/hook", {
      production: true,
      allowLocalhost: false,
      lookup,
    }),
    null,
  );
  assert.equal(
    await validateWebhookDestination("https://user:secret@crm.example.test/hook", {
      production: true,
      allowLocalhost: false,
      lookup,
    }),
    null,
  );
  assert.equal(lookupCalls, 0);

  const destination = await validateWebhookDestination(
    "https://crm.example.test/hook?tenant-token=kept-private",
    { production: true, allowLocalhost: false, lookup },
  );
  assert.ok(destination);
  assert.equal(destination.addresses[0]?.address, "8.8.8.8");
});

test("webhook destinations reject private, link-local, reserved, and mixed DNS answers", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.8",
    "169.254.169.254",
    "192.168.1.2",
    "198.51.100.25",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicRoutableAddress(address), false, address);
    assert.equal(
      await validateWebhookDestination(`https://${address.includes(":") ? `[${address}]` : address}/`, {
        production: true,
        allowLocalhost: false,
        lookup: publicLookup,
      }),
      null,
      address,
    );
  }

  assert.equal(
    await validateWebhookDestination("https://crm.example.test/", {
      production: true,
      allowLocalhost: false,
      lookup: async () => [
        { address: "8.8.8.8", family: 4 as const },
        { address: "10.0.0.8", family: 4 as const },
      ],
    }),
    null,
  );
  assert.equal(isPublicRoutableAddress("2606:4700:4700::1111"), true);
});

test("webhook destination DNS resolution is bounded", async () => {
  assert.equal(
    await validateWebhookDestination("https://crm.example.test/", {
      production: true,
      allowLocalhost: false,
      dnsTimeoutMs: 10,
      lookup: () => new Promise<ReadonlyArray<WebhookAddress>>(() => undefined),
    }),
    null,
  );
});

test("localhost callbacks require an explicit non-production flag", async () => {
  const localhostLookup = async (): Promise<ReadonlyArray<WebhookAddress>> => [
    { address: "127.0.0.1", family: 4 },
  ];

  assert.equal(
    await validateWebhookDestination("http://localhost:8787/hook", {
      production: false,
      allowLocalhost: false,
      lookup: localhostLookup,
    }),
    null,
  );
  assert.ok(
    await validateWebhookDestination("http://localhost:8787/hook", {
      production: false,
      allowLocalhost: true,
      lookup: localhostLookup,
    }),
  );
  assert.equal(
    await validateWebhookDestination("http://crm.example.test/hook", {
      production: false,
      allowLocalhost: true,
      lookup: publicLookup,
    }),
    null,
  );
  assert.equal(
    localWebhookTestingEnabled({
      NODE_ENV: "production",
      ARCLI_ALLOW_LOCAL_CRM_WEBHOOKS: "true",
    }),
    false,
  );
  assert.equal(
    localWebhookTestingEnabled({
      NODE_ENV: "test",
      ARCLI_ALLOW_LOCAL_CRM_WEBHOOKS: "true",
    }),
    true,
  );
});

test("delivery pins DNS, sends an idempotency key, and does not follow redirects", async () => {
  let receivedIdempotencyKey: string | undefined;
  let requests = 0;

  await withLocalServer((request, response) => {
    requests += 1;
    const idempotencyHeader = request.headers["idempotency-key"];
    receivedIdempotencyKey = Array.isArray(idempotencyHeader)
      ? idempotencyHeader[0]
      : idempotencyHeader;
    response.writeHead(302, { Location: "http://127.0.0.1/internal" });
    response.end("redirect body is never followed");
  }, async (port) => {
    const delivered = await deliverCrmWebhook(
      {
        // This hostname is intentionally not resolvable. The request succeeds
        // only when delivery uses the vetted/pinned address below.
        url: new URL(`http://safe-webhook.example.test:${port}/hook`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
      },
      { source: "hn", url: "https://news.ycombinator.com/item?id=1" },
      "arcli-lead-11111111-1111-1111-1111-111111111111",
    );

    assert.equal(delivered, false);
  });

  assert.equal(requests, 1);
  assert.equal(
    receivedIdempotencyKey,
    "arcli-lead-11111111-1111-1111-1111-111111111111",
  );
});

test("delivery rejects an oversized response body without retaining it", async () => {
  await withLocalServer((_request, response) => {
    response.writeHead(200);
    response.end(Buffer.alloc(CRM_WEBHOOK_MAX_RESPONSE_BYTES + 1));
  }, async (port) => {
    const delivered = await deliverCrmWebhook(
      {
        url: new URL(`http://safe-webhook.example.test:${port}/hook`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
      },
      { source: null },
      "arcli-lead-22222222-2222-2222-2222-222222222222",
    );
    assert.equal(delivered, false);
  });
});

test("delivery has a bounded timeout", async () => {
  await withLocalServer((_request, _response) => {
    // Intentionally leave the connection open until the client timeout fires.
  }, async (port) => {
    const delivered = await deliverCrmWebhook(
      {
        url: new URL(`http://safe-webhook.example.test:${port}/hook`),
        addresses: [{ address: "127.0.0.1", family: 4 }],
      },
      { source: null },
      "arcli-lead-33333333-3333-3333-3333-333333333333",
      { timeoutMs: 25 },
    );
    assert.equal(delivered, false);
  });
});
