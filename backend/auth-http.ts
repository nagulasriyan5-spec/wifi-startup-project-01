import { Hono } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { HttpBindings } from "@hono/node-server";
import * as jose from "jose";
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { Session } from "@contracts/constants";
import type { User } from "@db/schema";
import { env } from "./lib/env";
import { getSessionCookieOptions } from "./lib/cookies";
import { signSessionToken } from "./sriyan/session";
import {
  createUser,
  findUserByEmail,
  findUserByPasswordResetTokenHash,
  findUserByUnionId,
  setUserPassword,
  setUserPasswordResetToken,
  updateUserLastSignIn,
  upsertUser,
} from "./queries/users";

type AuthState = {
  provider: "google" | "apple" | "sriyan";
  redirectTo: string;
  remember: boolean;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
};

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type AppleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  token_type?: string;
};

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or less.");

const credentialSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  remember: z.boolean().optional().default(false),
});

const signupSchema = credentialSchema.extend({
  name: z.string().trim().max(120).optional(),
});

const resetRequestSchema = z.object({
  email: emailSchema,
});

const resetCompleteSchema = z.object({
  token: z.string().min(24),
  password: passwordSchema,
  remember: z.boolean().optional().default(true),
});

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
  };
}

function fallbackNameFromEmail(email: string) {
  const [localPart] = email.split("@");
  return (
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "SRIYAN User"
  );
}

function emailUnionId(email: string) {
  return `email:${createHash("sha256").update(email).digest("hex")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:v1:${salt}:${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [algorithm, version, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getBaseUrlFromRequest(c: Context) {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function getAppBaseUrl(c: Context) {
  return env.publicAppUrl || getBaseUrlFromRequest(c);
}

function sanitizeRedirectTo(value: string | undefined | null) {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}

function loginRedirect(c: Context, params: Record<string, string>) {
  const url = new URL("/login", getAppBaseUrl(c));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return c.redirect(url.toString(), 302);
}

function signState(state: AuthState) {
  const data = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.appSecret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

function verifyState(rawState: string): AuthState {
  const [data, signature] = rawState.split(".");
  if (!data || !signature) throw new Error("OAuth state is malformed.");
  const expectedSignature = createHmac("sha256", env.appSecret)
    .update(data)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("OAuth state signature is invalid.");
  }

  const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  const state = z
    .object({
      provider: z.enum(["google", "apple", "sriyan"]),
      redirectTo: z.string(),
      remember: z.boolean(),
    })
    .parse(parsed);
  return {
    ...state,
    redirectTo: sanitizeRedirectTo(state.redirectTo),
  };
}

async function issueSession(c: Context, user: User, remember: boolean) {
  const token = await signSessionToken({
    unionId: user.unionId,
    clientId: env.appId,
  });
  const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, token, {
    ...cookieOpts,
    ...(remember ? { maxAge: Session.maxAgeMs / 1000 } : {}),
  });
}

async function parseJson<T extends z.ZodType>(c: Context, schema: T) {
  const body = await c.req.json().catch(() => null);
  return schema.safeParse(body);
}

function validationError(error: z.ZodError) {
  return error.issues.at(0)?.message ?? "Invalid request.";
}

async function deliverPasswordResetEmail(input: {
  email: string;
  resetUrl: string;
  token: string;
}) {
  if (!env.authEmailWebhookUrl) return false;

  const response = await fetch(env.authEmailWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: input.email,
      subject: "Reset your SRIYAN password",
      resetUrl: input.resetUrl,
      token: input.token,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Password reset email delivery failed: ${text}`);
  }

  return true;
}

async function signInResponse(c: Context, user: User, remember: boolean) {
  await updateUserLastSignIn(user.id);
  await issueSession(c, user, remember);
  return c.json({
    ok: true,
    user: publicUser(user),
    redirectTo: "/choose-role",
  });
}

export const authHttpApp = new Hono<{ Bindings: HttpBindings }>();

authHttpApp.post("/signup", async c => {
  const parsed = await parseJson(c, signupSchema);
  if (!parsed.success) {
    return c.json({ ok: false, error: validationError(parsed.error) }, 400);
  }

  const { email, password, remember } = parsed.data;
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return c.json(
      {
        ok: false,
        error: "An account already exists for this email. Please sign in.",
      },
      409
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    unionId: emailUnionId(email),
    email,
    name: parsed.data.name || fallbackNameFromEmail(email),
    passwordHash,
    emailVerifiedAt: new Date(),
    lastSignInAt: new Date(),
  });

  if (!user) {
    return c.json({ ok: false, error: "Unable to create account." }, 500);
  }

  await issueSession(c, user, remember);
  return c.json(
    { ok: true, user: publicUser(user), redirectTo: "/choose-role" },
    201
  );
});

authHttpApp.post("/login", async c => {
  const parsed = await parseJson(c, credentialSchema);
  if (!parsed.success) {
    return c.json({ ok: false, error: validationError(parsed.error) }, 400);
  }

  const { email, password, remember } = parsed.data;
  const user = await findUserByEmail(email);
  if (
    !user ||
    !user.isActive ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return c.json({ ok: false, error: "Invalid email or password." }, 401);
  }

  return signInResponse(c, user, remember);
});

authHttpApp.post("/password-reset/request", async c => {
  const parsed = await parseJson(c, resetRequestSchema);
  if (!parsed.success) {
    return c.json({ ok: false, error: validationError(parsed.error) }, 400);
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user) {
    return c.json({
      ok: true,
      delivery: "unknown",
      message:
        "If an account exists for this email, a password reset link will be sent.",
    });
  }

  const token = randomBytes(32).toString("base64url");
  const resetUrl = new URL("/login", getAppBaseUrl(c));
  resetUrl.searchParams.set("mode", "reset");
  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("email", parsed.data.email);

  await setUserPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });

  const delivered = await deliverPasswordResetEmail({
    email: parsed.data.email,
    resetUrl: resetUrl.toString(),
    token,
  });

  return c.json({
    ok: true,
    delivery: delivered
      ? "email"
      : env.isProduction
        ? "not_configured"
        : "local_token",
    message: delivered
      ? "Password reset link sent."
      : env.isProduction
        ? "Password reset was created, but email delivery is not configured on this server."
        : "Password reset link generated for local development.",
    ...(!env.isProduction && !delivered
      ? { resetToken: token, resetUrl: resetUrl.toString() }
      : {}),
  });
});

authHttpApp.post("/password-reset/complete", async c => {
  const parsed = await parseJson(c, resetCompleteSchema);
  if (!parsed.success) {
    return c.json({ ok: false, error: validationError(parsed.error) }, 400);
  }

  const user = await findUserByPasswordResetTokenHash(
    hashToken(parsed.data.token)
  );
  if (!user || !user.isActive) {
    return c.json(
      { ok: false, error: "Password reset link is invalid or expired." },
      400
    );
  }

  await setUserPassword(user.id, await hashPassword(parsed.data.password));
  const refreshedUser = await findUserByUnionId(user.unionId);
  if (!refreshedUser) {
    return c.json({ ok: false, error: "Unable to refresh user session." }, 500);
  }

  await issueSession(c, refreshedUser, parsed.data.remember);
  return c.json({
    ok: true,
    user: publicUser(refreshedUser),
    redirectTo: "/choose-role",
  });
});

export const oauthHttpApp = new Hono<{ Bindings: HttpBindings }>();

oauthHttpApp.get("/authorize", async c => {
  const provider = c.req.query("provider") as "google" | "apple" | undefined;
  const remember = c.req.query("remember") === "1";
  const redirectTo = sanitizeRedirectTo(c.req.query("redirect_to"));
  const loginHint = c.req.query("login_hint") ?? undefined;

  if (
    provider === "google" &&
    env.googleOauthClientId &&
    env.googleOauthClientSecret
  ) {
    const state = signState({ provider: "google", redirectTo, remember });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.googleOauthClientId);
    url.searchParams.set(
      "redirect_uri",
      new URL("/api/oauth/google/callback", getAppBaseUrl(c)).toString()
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    if (loginHint) url.searchParams.set("login_hint", loginHint);
    return c.redirect(url.toString(), 302);
  }

  if (
    provider === "apple" &&
    env.appleOauthClientId &&
    env.appleOauthTeamId &&
    env.appleOauthKeyId &&
    env.appleOauthPrivateKey
  ) {
    const state = signState({ provider: "apple", redirectTo, remember });
    const url = new URL("https://appleid.apple.com/auth/authorize");
    url.searchParams.set("client_id", env.appleOauthClientId);
    url.searchParams.set(
      "redirect_uri",
      new URL("/api/oauth/apple/callback", getAppBaseUrl(c)).toString()
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("scope", "name email");
    url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  }

  if (env.sriyanAuthUrl) {
    const url = new URL("/api/oauth/authorize", env.sriyanAuthUrl);
    for (const [key, value] of new URL(c.req.url).searchParams) {
      url.searchParams.set(key, value);
    }
    return c.redirect(url.toString(), 302);
  }

  return loginRedirect(c, {
    auth_error:
      provider === "apple"
        ? "Apple sign in is not configured. Add Apple OAuth credentials on the server."
        : provider === "google"
          ? "Google sign in is not configured. Add Google OAuth credentials on the server."
          : "OAuth is not configured. Use email and password, or add a SRIYAN auth server.",
  });
});

oauthHttpApp.get("/google/callback", async c => {
  const error = c.req.query("error");
  if (error) {
    return loginRedirect(c, { auth_error: error });
  }

  const code = c.req.query("code");
  const rawState = c.req.query("state");
  if (!code || !rawState) {
    return loginRedirect(c, {
      auth_error: "Google sign in response is incomplete.",
    });
  }

  try {
    const state = verifyState(rawState);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.googleOauthClientId,
        client_secret: env.googleOauthClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: new URL(
          "/api/oauth/google/callback",
          getAppBaseUrl(c)
        ).toString(),
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(await tokenResponse.text());
    }

    const token = (await tokenResponse.json()) as GoogleTokenResponse;
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }
    );
    if (!profileResponse.ok) {
      throw new Error(await profileResponse.text());
    }

    const profile = (await profileResponse.json()) as GoogleProfile;
    await upsertUser({
      unionId: `google:${profile.sub}`,
      email: profile.email?.toLowerCase(),
      name:
        profile.name ||
        (profile.email ? fallbackNameFromEmail(profile.email) : "Google User"),
      avatar: profile.picture,
      emailVerifiedAt: profile.email_verified ? new Date() : undefined,
      lastSignInAt: new Date(),
    });

    const user = await findUserByUnionId(`google:${profile.sub}`);
    if (!user) throw new Error("Unable to create Google user.");

    await issueSession(c, user, state.remember);
    return c.redirect(state.redirectTo, 302);
  } catch (callbackError) {
    console.error("[auth] Google OAuth failed", callbackError);
    return loginRedirect(c, {
      auth_error: "Google sign in failed. Please try again.",
    });
  }
});

async function getAppleCallbackParams(c: Context) {
  if (c.req.method === "POST") {
    const body = await c.req.parseBody();
    return {
      code: typeof body.code === "string" ? body.code : undefined,
      state: typeof body.state === "string" ? body.state : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
      user: typeof body.user === "string" ? body.user : undefined,
    };
  }

  return {
    code: c.req.query("code"),
    state: c.req.query("state"),
    error: c.req.query("error"),
    user: c.req.query("user"),
  };
}

async function createAppleClientSecret() {
  const privateKey = await jose.importPKCS8(
    env.appleOauthPrivateKey.replace(/\\n/g, "\n"),
    "ES256"
  );
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.appleOauthKeyId })
    .setIssuer(env.appleOauthTeamId)
    .setSubject(env.appleOauthClientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(privateKey);
}

async function handleAppleCallback(c: Context) {
  const params = await getAppleCallbackParams(c);
  if (params.error) {
    return loginRedirect(c, { auth_error: params.error });
  }
  if (!params.code || !params.state) {
    return loginRedirect(c, {
      auth_error: "Apple sign in response is incomplete.",
    });
  }

  try {
    const state = verifyState(params.state);
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.appleOauthClientId,
        client_secret: await createAppleClientSecret(),
        code: params.code,
        grant_type: "authorization_code",
        redirect_uri: new URL(
          "/api/oauth/apple/callback",
          getAppBaseUrl(c)
        ).toString(),
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(await tokenResponse.text());
    }

    const token = (await tokenResponse.json()) as AppleTokenResponse;
    if (!token.id_token) {
      throw new Error("Apple id_token missing.");
    }

    const jwks = jose.createRemoteJWKSet(
      new URL("https://appleid.apple.com/auth/keys")
    );
    const verified = await jose.jwtVerify(token.id_token, jwks, {
      issuer: "https://appleid.apple.com",
      audience: env.appleOauthClientId,
    });

    const appleUser = params.user
      ? (JSON.parse(params.user) as {
          name?: { firstName?: string; lastName?: string };
        })
      : undefined;
    const subject = String(verified.payload.sub);
    const email =
      typeof verified.payload.email === "string"
        ? verified.payload.email.toLowerCase()
        : undefined;
    const name = [appleUser?.name?.firstName, appleUser?.name?.lastName]
      .filter(Boolean)
      .join(" ");

    await upsertUser({
      unionId: `apple:${subject}`,
      email,
      name: name || (email ? fallbackNameFromEmail(email) : "Apple User"),
      emailVerifiedAt: email ? new Date() : undefined,
      lastSignInAt: new Date(),
    });

    const user = await findUserByUnionId(`apple:${subject}`);
    if (!user) throw new Error("Unable to create Apple user.");

    await issueSession(c, user, state.remember);
    return c.redirect(state.redirectTo, 302);
  } catch (callbackError) {
    console.error("[auth] Apple OAuth failed", callbackError);
    return loginRedirect(c, {
      auth_error: "Apple sign in failed. Please try again.",
    });
  }
}

oauthHttpApp.get("/apple/callback", handleAppleCallback);
oauthHttpApp.post("/apple/callback", handleAppleCallback);
