import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "reconcile_player";
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const DEV_SECRET = "reconcile-dev-secret-never-use-in-production";

/** Read at request time, so a build without the variable still works. Production refuses to run on the dev value. */
export function sessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return DEV_SECRET;
}

const mac = (id: string, secret: string) => createHmac("sha256", secret).update(id).digest("base64url");

/** The cookie value: the player id and a MAC over it, so an id cannot be guessed into a session. */
export const sign = (id: string, secret: string) => `${id}.${mac(id, secret)}`;

/** Returns the player id, or null for a missing or tampered value. */
export function verify(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(mac(id, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
