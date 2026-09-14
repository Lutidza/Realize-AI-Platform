/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDiscoveryGrant.service.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Выдаёт и проверяет короткий HMAC-допуск к чтениям одного запуска.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  parseIdentifier,
  type PageDiscoveryGrant,
} from "@realize/ai-contracts";
import type { Payload } from "payload";
import { DEFAULT_API_ROUTE } from "../constants";
import { EndpointError } from "../endpoints/http";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import type { PageDiscoveryClaims } from "./PageDiscovery.types";

const lifetime = 15 * 60_000;
const denied = () =>
  new EndpointError(
    "UNAUTHENTICATED",
    "Допуск к инструментам страницы недействителен или истёк.",
    401,
  );

/** Domain separation не позволяет использовать подпись как credential другого протокола. */
const signature = (
  encoded: string,
  options: SanitizedRealizeAIPluginOptions,
): Buffer => {
  const secret = process.env[options.runtime.controlPlaneTokenEnv];
  if (!secret) throw denied();
  return createHmac("sha256", secret)
    .update("realize:page-discovery:v1\0")
    .update(encoded)
    .digest();
};

/** URL строится исключительно из конфигурации установки, никогда из Host запроса. */
export const createPageDiscoveryGrant = (
  payload: Payload,
  options: SanitizedRealizeAIPluginOptions,
  runID: string,
  userID: string,
): PageDiscoveryGrant => {
  const issuedAt = Date.now();
  const claims: PageDiscoveryClaims = {
    version: 1,
    runID: parseIdentifier(runID, "run id"),
    userID: parseIdentifier(userID, "actor id"),
    issuedAt,
    expiresAt: issuedAt + lifetime,
  };
  const origin = new URL(payload.config.serverURL || "");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new EndpointError(
      "CONFLICT",
      "Адрес установки для инструментов страницы не настроен.",
      409,
    );
  const endpoint = new URL(
    `${payload.config.routes.api}${DEFAULT_API_ROUTE}/chat/page-tools/${encodeURIComponent(runID)}`,
    origin,
  ).href;
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    endpoint,
    token: `${encoded}.${signature(encoded, options).toString("base64url")}`,
  };
};

/** Проверка route binding и срока предшествует чтению какого-либо run или пользователя. */
export const verifyPageDiscoveryGrant = (
  token: string,
  runID: string,
  options: SanitizedRealizeAIPluginOptions,
): PageDiscoveryClaims => {
  try {
    if (
      token.length > 1_024 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw denied();
    const [encoded, digest] = token.split(".");
    const actual = Buffer.from(digest, "base64url");
    const expected = signature(encoded, options);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw denied();
    const value: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw denied();
    const claims = value as PageDiscoveryClaims;
    if (
      Object.keys(claims).sort().join(",") !==
        "expiresAt,issuedAt,runID,userID,version" ||
      claims.version !== 1 ||
      claims.runID !== runID ||
      parseIdentifier(claims.runID, "run id") !== runID ||
      !parseIdentifier(claims.userID, "actor id") ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.issuedAt > Date.now() ||
      claims.expiresAt <= Date.now() ||
      claims.expiresAt - claims.issuedAt !== lifetime
    )
      throw denied();
    return claims;
  } catch {
    throw denied();
  }
};
