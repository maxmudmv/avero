import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import {
  computePkceChallenge,
  generateOpaqueToken,
  generatePkceVerifier,
  signPayload,
  verifySignedPayload,
} from "@/server/security/crypto";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

export const GOOGLE_OAUTH_COOKIE_NAME = "avero_google_oauth";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface GoogleOAuthStatePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  mode: "login" | "link";
  linkToken?: string;
  expiresAtMs: number;
}

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export class GoogleOAuthError extends Error {
  constructor(
    public readonly code:
      | "GOOGLE_NOT_CONFIGURED"
      | "INVALID_OAUTH_STATE"
      | "TOKEN_EXCHANGE_FAILED"
      | "INVALID_ID_TOKEN"
      | "EMAIL_NOT_VERIFIED",
    message: string
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export function getGoogleRedirectUri(): string {
  const env = getServerEnv();
  return (
    env.GOOGLE_REDIRECT_URI ||
    `${env.APP_URL.replace(/\/$/, "")}/api/v1/auth/google/callback`
  );
}

export function assertGoogleConfigured(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleOAuthError(
      "GOOGLE_NOT_CONFIGURED",
      "Google OAuth credentials are not configured on the server"
    );
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: getGoogleRedirectUri(),
  };
}

export function createGoogleAuthorizationRequest(options: {
  mode: "login" | "link";
  linkToken?: string;
}): {
  authorizationUrl: string;
  signedStateCookie: string;
} {
  const env = getServerEnv();
  const { clientId, redirectUri } = assertGoogleConfigured();

  const state = generateOpaqueToken(24);
  const nonce = generateOpaqueToken(24);
  const codeVerifier = generatePkceVerifier();
  const codeChallenge = computePkceChallenge(codeVerifier);

  const payload: GoogleOAuthStatePayload = {
    state,
    nonce,
    codeVerifier,
    mode: options.mode,
    linkToken: options.linkToken,
    expiresAtMs: Date.now() + OAUTH_STATE_TTL_MS,
  };

  const signedStateCookie = signPayload(payload, env.AUTH_SESSION_SECRET);

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  return {
    authorizationUrl: url.toString(),
    signedStateCookie,
  };
}

export function verifyGoogleStateCookie(
  signedCookie: string | undefined,
  returnedState: string | undefined
): GoogleOAuthStatePayload {
  const env = getServerEnv();
  if (!signedCookie || !returnedState) {
    throw new GoogleOAuthError(
      "INVALID_OAUTH_STATE",
      "Missing OAuth state verification data"
    );
  }

  const parsed = verifySignedPayload<GoogleOAuthStatePayload>(
    signedCookie,
    env.AUTH_SESSION_SECRET
  );
  if (!parsed || parsed.expiresAtMs < Date.now()) {
    throw new GoogleOAuthError(
      "INVALID_OAUTH_STATE",
      "OAuth state cookie is invalid or expired"
    );
  }

  if (parsed.state !== returnedState) {
    throw new GoogleOAuthError(
      "INVALID_OAUTH_STATE",
      "OAuth state parameter mismatch"
    );
  }

  return parsed;
}

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().optional(),
});

const tokenInfoSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.union([z.boolean(), z.enum(["true", "false"])]),
  name: z.string().optional(),
  nonce: z.string().optional(),
  exp: z.union([z.number(), z.string()]),
});

export async function exchangeGoogleCodeAndVerify(params: {
  code: string;
  codeVerifier: string;
  expectedNonce: string;
}): Promise<VerifiedGoogleProfile> {
  const { clientId, clientSecret, redirectUri } = assertGoogleConfigured();

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    throw new GoogleOAuthError(
      "TOKEN_EXCHANGE_FAILED",
      `Google token exchange failed with status ${tokenRes.status}`
    );
  }

  const tokenJson = tokenResponseSchema.safeParse(await tokenRes.json());
  if (!tokenJson.success) {
    throw new GoogleOAuthError(
      "TOKEN_EXCHANGE_FAILED",
      "Google token response missing id_token"
    );
  }

  // Verify the ID token via Google's tokeninfo endpoint + strict claim validation
  const verifyUrl = new URL(GOOGLE_TOKENINFO_ENDPOINT);
  verifyUrl.searchParams.set("id_token", tokenJson.data.id_token);

  const infoRes = await fetch(verifyUrl.toString(), { method: "GET" });
  if (!infoRes.ok) {
    throw new GoogleOAuthError(
      "INVALID_ID_TOKEN",
      "Google ID token verification failed"
    );
  }

  const infoParsed = tokenInfoSchema.safeParse(await infoRes.json());
  if (!infoParsed.success) {
    throw new GoogleOAuthError(
      "INVALID_ID_TOKEN",
      "Google ID token claims are malformed"
    );
  }

  const claims = infoParsed.data;
  const validIssuers = new Set([
    "https://accounts.google.com",
    "accounts.google.com",
  ]);
  if (!validIssuers.has(claims.iss)) {
    throw new GoogleOAuthError("INVALID_ID_TOKEN", "Invalid Google issuer");
  }
  if (claims.aud !== clientId) {
    throw new GoogleOAuthError("INVALID_ID_TOKEN", "Google audience mismatch");
  }
  if (!claims.nonce || claims.nonce !== params.expectedNonce) {
    throw new GoogleOAuthError("INVALID_ID_TOKEN", "Google OIDC nonce mismatch");
  }

  const expSeconds = Number(claims.exp);
  if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= Date.now()) {
    throw new GoogleOAuthError("INVALID_ID_TOKEN", "Google ID token expired");
  }

  const isEmailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  if (!isEmailVerified) {
    throw new GoogleOAuthError(
      "EMAIL_NOT_VERIFIED",
      "Google account email is not verified"
    );
  }

  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified: true,
    name: claims.name?.trim() || claims.email.split("@")[0] || "Avero User",
  };
}
