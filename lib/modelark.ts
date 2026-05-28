/**
 * BytePlus ModelArk Asset Library + TOS API client (server-only).
 *
 * Two APIs share the same Volcengine HMAC-SHA256 signing algorithm but
 * differ in host, service name, HTTP method, and path shape:
 *
 *   ModelArk OpenAPI — POST / with Action/Version query params, service "ark"
 *   Volcengine TOS   — PUT /{key} on bucket host, service "tos"
 *
 * Required env vars (add to .env.local):
 *   MODELARK_AK              BytePlus Access Key
 *   MODELARK_SK              BytePlus Secret Key
 *   MODELARK_TOS_BUCKET      TOS bucket name (public-read, for asset uploads)
 *   MODELARK_HOST            e.g. open.byteplusapi.com  (default)
 *   MODELARK_REGION          e.g. ap-southeast-1        (default)
 *   MODELARK_SERVICE         e.g. ark                   (default)
 *   MODELARK_VERSION         e.g. 2024-01-01            (default)
 */

import { createHash, createHmac } from "crypto";
import { randomUUID } from "crypto";

// ─────────────────────────── Config ──────────────────────────────────────

function cfg(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key} — add it to .env.local`);
  return v;
}

function getHost()      { return process.env.MODELARK_HOST       ?? "open.byteplusapi.com"; }
function getRegion()    { return process.env.MODELARK_REGION     ?? "ap-southeast-1"; }
function getService()   { return process.env.MODELARK_SERVICE    ?? "ark"; }
function getVersion()   { return process.env.MODELARK_VERSION    ?? "2024-01-01"; }
function getTosRegion() { return process.env.MODELARK_TOS_REGION ?? "cn-beijing"; }

// ─────────────────────────── HMAC-SHA256 signing ─────────────────────────
// Volcengine signing spec — analogous to AWS SigV4 but:
//   • No "BytePlus4" / "AWS4" prefix on the initial HMAC key — raw SK only
//   • Signed headers: content-type;host;x-date (no x-content-sha256)
//   • Algorithm string: HMAC-SHA256

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacSha256Hex(key: Buffer | string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; // YYYYMMDDTHHmmssZ
}

/**
 * Generic Volcengine request signer.
 * Builds Authorization + X-Date headers for any service/method/path.
 *
 * extraHeaders must already contain Content-Type (and any x-tos-* headers).
 * They will be included in the signed header set, sorted lexicographically.
 */
function signRequest(params: {
  method: string;
  host: string;
  path: string;
  canonicalQuery: string;
  service: string;
  region: string;
  extraHeaders: Record<string, string>;  // must include content-type
  bodyHash: string;
}): Record<string, string> {
  const ak = cfg("MODELARK_AK");
  const sk = cfg("MODELARK_SK");
  const { method, host, path, canonicalQuery, service, region, extraHeaders, bodyHash } = params;

  const now = new Date();
  const dateFull = formatDateTime(now);
  const dateShort = formatDate(now);

  // Merge x-date with the caller's extra headers, then sort for canonical form
  const allHeaders: Record<string, string> = { ...extraHeaders, "x-date": dateFull, host };
  const sortedNames = Object.keys(allHeaders).sort();
  const signedHeaderNames = sortedNames.join(";");
  const canonicalHeaders = sortedNames.map((k) => `${k}:${allHeaders[k]}`).join("\n") + "\n";

  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaderNames, bodyHash].join("\n");

  const credentialScope = `${dateShort}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", dateFull, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate    = hmacSha256(sk, dateShort);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "request");
  const signature = hmacSha256Hex(kSigning, stringToSign);

  const authorization =
    `HMAC-SHA256 Credential=${ak}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaderNames}, ` +
    `Signature=${signature}`;

  return { ...extraHeaders, "X-Date": dateFull, Authorization: authorization };
}

/**
 * TOS4-HMAC-SHA256 signer for BytePlus TOS (S3-SigV4 style).
 * Different from the Volcengine HMAC-SHA256 scheme used by ModelArk OpenAPI:
 *   • Algorithm string: TOS4-HMAC-SHA256
 *   • Date header: X-Tos-Date
 *   • Key derivation seeds with "TOS4" + SK (not raw SK)
 */
function signTosRequest(params: {
  method: string;
  host: string;
  path: string;
  canonicalQuery: string;
  region: string;
  extraHeaders: Record<string, string>;
  bodyHash: string;
}): Record<string, string> {
  const ak = cfg("MODELARK_AK");
  const sk = cfg("MODELARK_SK");
  const { method, host, path, canonicalQuery, region, extraHeaders, bodyHash } = params;

  const now = new Date();
  const dateFull = formatDateTime(now);   // YYYYMMDDTHHmmssZ
  const dateShort = formatDate(now);      // YYYYMMDD

  const allHeaders: Record<string, string> = {
    ...extraHeaders,
    "x-tos-content-sha256": bodyHash,
    "x-tos-date": dateFull,
    host,
  };
  const sortedNames = Object.keys(allHeaders).sort();
  const signedHeaderNames = sortedNames.join(";");
  const canonicalHeaders = sortedNames.map((k) => `${k}:${allHeaders[k]}`).join("\n") + "\n";

  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaderNames, bodyHash].join("\n");

  const credentialScope = `${dateShort}/${region}/tos/request`;
  const stringToSign = ["TOS4-HMAC-SHA256", dateFull, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  // BytePlus TOS key derivation uses raw SK (same Volcengine convention, no prefix)
  const kDate    = hmacSha256(sk, dateShort);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "tos");
  const kSigning = hmacSha256(kService, "request");
  const signature = hmacSha256Hex(kSigning, stringToSign);

  const authorization =
    `TOS4-HMAC-SHA256 Credential=${ak}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaderNames}, ` +
    `Signature=${signature}`;

  return { ...extraHeaders, "X-Tos-Content-Sha256": bodyHash, "X-Tos-Date": dateFull, Authorization: authorization };
}

// Convenience wrapper for the ModelArk OpenAPI (POST / with Action query param)
function buildSignedHeaders(action: string, body: string): { headers: Record<string, string> } {
  const host = getHost();
  const region = getRegion();
  const service = getService();
  const version = getVersion();

  const queryParams = new URLSearchParams({ Action: action, Version: version });
  queryParams.sort();

  const headers = signRequest({
    method: "POST",
    host,
    path: "/",
    canonicalQuery: queryParams.toString(),
    service,
    region,
    extraHeaders: { "content-type": "application/json" },
    bodyHash: sha256Hex(body),
  });

  return { headers };
}

// ─────────────────────────── HTTP core ───────────────────────────────────

export class ModelArkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`ModelArk [${code}]: ${message}`);
    this.name = "ModelArkError";
  }
}

async function post<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const host = getHost();
  const version = getVersion();
  const body = JSON.stringify(payload);
  const { headers } = buildSignedHeaders(action, body);

  const url = `https://${host}/?Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ModelArkError("ParseError", `Non-JSON response: ${text.slice(0, 300)}`, res.status);
  }

  // HTTP-level errors
  if (res.status === 429 || res.status >= 500) {
    throw new ModelArkError("TransientError", `HTTP ${res.status}`, res.status);
  }

  // BytePlus wraps errors inside ResponseMetadata.Error
  const meta = data.ResponseMetadata as Record<string, unknown> | undefined;
  const err = meta?.Error as Record<string, unknown> | undefined;
  if (err) {
    throw new ModelArkError(
      String(err.Code ?? "APIError"),
      String(err.Message ?? "Unknown error"),
      res.status,
    );
  }

  const result = data.Result ?? data;
  return result as T;
}

// ─────────────────────────── TOS upload ──────────────────────────────────

/**
 * Upload a file buffer to a Volcengine TOS bucket and return the public URL.
 *
 * Uses path-style requests: tos.{region}.byteplusapi.com/{bucket}/{key}
 * The bucket must have a public-read policy so the returned URL is accessible
 * without auth (required for BytePlus ModelArk to fetch it during registration).
 *
 * Required env var: MODELARK_TOS_BUCKET
 * Optional env var: MODELARK_TOS_HOST (overrides the default endpoint)
 */
export async function uploadToTos(
  fileBuffer: Buffer,
  contentType: string,
  originalFilename: string,
): Promise<string> {
  const bucket = cfg("MODELARK_TOS_BUCKET");
  const storageRegion = getRegion();
  const signingRegion = getTosRegion();
  // BytePlus TOS overseas endpoint: tos-{storage-region}.bytepluses.com
  // Virtual-hosted style: {bucket}.tos-{storage-region}.bytepluses.com/{key}
  const tosBaseHost = process.env.MODELARK_TOS_HOST ?? `tos-${storageRegion}.bytepluses.com`;
  const host = `${bucket}.${tosBaseHost}`;

  const ext = originalFilename.includes(".")
    ? originalFilename.slice(originalFilename.lastIndexOf("."))
    : "";
  const objectKey = `modelark-uploads/${randomUUID()}${ext}`;

  // Virtual-hosted style: path = /{key} only (bucket is in the host)
  const path = `/${objectKey}`;
  const bodyHash = sha256Hex(fileBuffer);

  const headers = signTosRequest({
    method: "PUT",
    host,
    path,
    canonicalQuery: "",
    region: signingRegion,
    extraHeaders: {
      "content-type": contentType,
      "x-tos-acl": "public-read",
    },
    bodyHash,
  });

  const url = `https://${host}${path}`;

  // Use node:https directly to avoid Node's strict TLS validation issues
  const { request } = await import("node:https");
  await new Promise<void>((resolve, reject) => {
    const parsed = new URL(url);
    const req = request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname,
        method: "PUT",
        headers: {
          ...headers,
          "Content-Length": String(fileBuffer.length),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            const body = Buffer.concat(chunks).toString("utf8").slice(0, 300);
            reject(new Error(`TOS upload failed (${res.statusCode}): ${body}`));
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });

  return url;
}

// ─────────────────────────── Public types ────────────────────────────────

export type AssetGroupInfo = {
  groupId: string;
  name: string;
  description?: string;
};

export type AssetInfo = {
  assetId: string;
  status: "Pending" | "Active" | "Failed" | string;
  assetType?: "Image" | "Video" | string;
  url?: string;
  errorMessage?: string;
};

export type ListAssetsPage = {
  assets: AssetInfo[];
  nextToken?: string; // page number as string when more pages exist
};

// ─────────────────────────── API actions ─────────────────────────────────

/** Create a new asset group. GroupType is always AIGC for our use case. */
export async function createAssetGroup(
  name: string,
  description = "",
): Promise<AssetGroupInfo> {
  const result = await post<{ Id: string }>("CreateAssetGroup", {
    Name: name,
    Description: description,
    GroupType: "AIGC",
  });
  return { groupId: result.Id, name, description };
}

/**
 * Register an image URL as an asset inside a group.
 * After creation, poll getAsset() until status === "Active".
 */
export async function createAsset(
  groupId: string,
  url: string,
  assetType = "Image",
): Promise<string> {
  const result = await post<{ Id: string }>("CreateAsset", {
    GroupId: groupId,
    URL: url,
    AssetType: assetType,
  });
  return result.Id;
}

/** Fetch the current status of a registered asset. */
export async function getAsset(assetId: string): Promise<AssetInfo> {
  const result = await post<{ Id?: string; Status?: string; AssetType?: string; URL?: string; Url?: string; FileUrl?: string; OriginUrl?: string; PreviewUrl?: string; ErrorMessage?: string }>(
    "GetAsset",
    { Id: assetId },
  );
  const rawUrl = result.URL ?? result.Url ?? result.FileUrl ?? result.OriginUrl ?? result.PreviewUrl;
  return {
    assetId: result.Id ?? assetId,
    status: result.Status ?? "Pending",
    assetType: result.AssetType,
    url: rawUrl ? String(rawUrl) : undefined,
    errorMessage: result.ErrorMessage,
  };
}

/** One page of asset groups (AIGC type). */
export async function listAssetGroups(
  pageSize = 100,
  pageNumber = 1,
): Promise<{ groups: AssetGroupInfo[]; total: number }> {
  const result = await post<{
    Items?: unknown[];
    GroupList?: unknown[];
    Groups?: unknown[];
    TotalCount?: number;
  }>("ListAssetGroups", {
    Filter: { GroupType: "AIGC" },
    PageSize: pageSize,
    PageNumber: pageNumber,
  });

  const raw = (result.Items ?? result.GroupList ?? result.Groups ?? []) as Array<Record<string, unknown>>;
  return {
    groups: raw.map((g) => ({
      groupId: String(g.Id ?? g.GroupId ?? ""),
      name: String(g.Name ?? ""),
      description: g.Description ? String(g.Description) : undefined,
    })),
    total: result.TotalCount ?? raw.length,
  };
}

/** Fetch every asset group by paginating until all pages are consumed. */
export async function listAllAssetGroups(): Promise<AssetGroupInfo[]> {
  const all: AssetGroupInfo[] = [];
  const pageSize = 100;
  let page = 1;
  while (true) {
    const { groups, total } = await listAssetGroups(pageSize, page);
    all.push(...groups);
    if (all.length >= total || groups.length < pageSize) break;
    page++;
  }
  return all;
}

/** One page of assets from a group. */
export async function listAssets(
  groupId: string,
  pageSize = 50,
  pageNumber = 1,
): Promise<ListAssetsPage> {
  const result = await post<{
    Items?: unknown[];
    AssetList?: unknown[];
    TotalCount?: number;
  }>("ListAssets", {
    Filter: { GroupIds: [groupId], GroupType: "AIGC" },
    PageSize: pageSize,
    PageNumber: pageNumber,
  });

  const raw = (result.Items ?? result.AssetList ?? []) as Array<Record<string, unknown>>;
  const total = result.TotalCount ?? raw.length;
  return {
    assets: raw.map((a) => ({
      assetId: String(a.Id ?? a.AssetId ?? ""),
      status: String(a.Status ?? "Unknown"),
      assetType: a.AssetType ? String(a.AssetType) : undefined,
      // API returns "URL" (all-caps) — also check legacy casing as fallback
      url: (a.URL ?? a.Url ?? a.FileUrl ?? a.OriginUrl ?? a.PreviewUrl ?? a.ThumbnailUrl)
        ? String(a.URL ?? a.Url ?? a.FileUrl ?? a.OriginUrl ?? a.PreviewUrl ?? a.ThumbnailUrl)
        : undefined,
    })),
    // Signal more pages when a full page was returned and total suggests more
    nextToken: raw.length === pageSize && total > pageSize * pageNumber
      ? String(pageNumber + 1)
      : undefined,
  };
}

/** Paginate through all assets in a group. */
export async function listAllAssets(groupId: string): Promise<AssetInfo[]> {
  const all: AssetInfo[] = [];
  let page = 1;
  while (true) {
    const result = await listAssets(groupId, 50, page);
    all.push(...result.assets);
    if (!result.nextToken) break;
    page++;
  }
  return all;
}
