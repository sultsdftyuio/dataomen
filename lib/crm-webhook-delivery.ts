import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";

import type {
  ValidatedWebhookDestination,
  WebhookAddress,
} from "./crm-webhook-destination";

export const CRM_WEBHOOK_TIMEOUT_MS = 4_000;
export const CRM_WEBHOOK_MAX_RESPONSE_BYTES = 16 * 1024;

type WebhookDeliveryOptions = {
  timeoutMs?: number;
  maxResponseBytes?: number;
};

type PinnedRequestOptions = RequestOptions & {
  autoSelectFamily?: boolean;
  rejectUnauthorized?: boolean;
};

function createPinnedLookup(
  addresses: readonly WebhookAddress[],
): NonNullable<RequestOptions["lookup"]> {
  return ((
    _hostname: string,
    lookupOptions: unknown,
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    const requestedFamily =
      typeof lookupOptions === "number"
        ? lookupOptions
        : typeof lookupOptions === "object" &&
            lookupOptions !== null &&
            "family" in lookupOptions &&
            typeof lookupOptions.family === "number"
          ? lookupOptions.family
          : 0;
    const address = addresses.find(
      (candidate) => requestedFamily === 0 || candidate.family === requestedFamily,
    );
    if (address) {
      callback(null, address.address, address.family);
      return;
    }

    const error = new Error(
      "No permitted DNS address is available for webhook delivery.",
    ) as NodeJS.ErrnoException;
    error.code = "ENOTFOUND";
    callback(error, "", 0);
  }) as NonNullable<RequestOptions["lookup"]>;
}

/**
 * Delivers one JSON webhook only to the vetted DNS answers supplied by
 * validateWebhookDestination. Node's native clients do not follow redirects,
 * so an endpoint cannot redirect this request to a different host.
 *
 * This helper never logs a URL, request body, response body, or thrown error:
 * customer-configured endpoints may contain credentials or sensitive data.
 */
export async function deliverCrmWebhook(
  destination: ValidatedWebhookDestination,
  payload: unknown,
  idempotencyKey: string,
  options: WebhookDeliveryOptions = {},
): Promise<boolean> {
  let requestBody: string;
  try {
    requestBody = JSON.stringify(payload);
  } catch {
    return false;
  }
  if (typeof requestBody !== "string") return false;

  const timeoutMs = options.timeoutMs ?? CRM_WEBHOOK_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? CRM_WEBHOOK_MAX_RESPONSE_BYTES;
  if (timeoutMs <= 0 || maxResponseBytes <= 0) return false;

  const requestOptions: PinnedRequestOptions = {
    protocol: destination.url.protocol,
    hostname: destination.url.hostname.replace(/^\[|\]$/g, ""),
    port: destination.url.port ? Number(destination.url.port) : undefined,
    path: `${destination.url.pathname}${destination.url.search}`,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody),
      "Idempotency-Key": idempotencyKey,
    },
    // DNS answers are pinned so a hostname that changes after validation cannot
    // send a request to an internal address.
    lookup: createPinnedLookup(destination.addresses),
    // Keep Node from asking our pinning lookup for an address array under its
    // Happy Eyeballs mode. One vetted address is selected deterministically;
    // every validated answer has already passed the public-address policy.
    autoSelectFamily: false,
    agent: false,
    maxHeaderSize: 8 * 1024,
    rejectUnauthorized: true,
  };

  return new Promise((resolve) => {
    let request: ClientRequest | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (delivered: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(delivered);
    };

    const onResponse = (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      let receivedBytes = 0;
      const contentLength = response.headers["content-length"];
      const declaredBytes = Number(
        Array.isArray(contentLength) ? contentLength[0] : contentLength,
      );

      response.once("aborted", () => finish(false));
      response.once("error", () => finish(false));

      // Read only a small bounded amount in order to release the connection.
      // The response is deliberately never parsed or logged.
      if (Number.isFinite(declaredBytes) && declaredBytes > maxResponseBytes) {
        response.destroy();
        finish(false);
        return;
      }

      response.on("data", (chunk: Buffer | string) => {
        receivedBytes += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk);
        if (receivedBytes > maxResponseBytes) {
          response.destroy();
          finish(false);
        }
      });
      response.once("end", () => finish(status >= 200 && status < 300));
    };

    try {
      request =
        destination.url.protocol === "http:"
          ? httpRequest(requestOptions, onResponse)
          : httpsRequest(requestOptions, onResponse);
      request.once("error", () => finish(false));
      request.once("timeout", () => {
        request?.destroy();
        finish(false);
      });
      request.setTimeout(timeoutMs);
      timeout = setTimeout(() => {
        request?.destroy();
        finish(false);
      }, timeoutMs);
      request.end(requestBody);
    } catch {
      finish(false);
    }
  });
}
