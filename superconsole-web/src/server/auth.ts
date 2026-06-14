import { WorkOS } from "@workos-inc/node";
import { env } from "cloudflare:workers";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "wos-session";

export interface SessionUser {
  workosId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

function workos() {
  return new WorkOS(env.WORKOS_API_KEY, { clientId: env.WORKOS_CLIENT_ID });
}

export function getAuthorizationUrl(): string {
  return workos().userManagement.getAuthorizationUrl({
    provider: "authkit",
    clientId: env.WORKOS_CLIENT_ID,
    redirectUri: env.WORKOS_REDIRECT_URI,
  });
}

// Exchange the authorization code, seal the session into an httpOnly cookie,
// and return the authenticated user.
export async function handleCallback(code: string): Promise<SessionUser> {
  const { sealedSession, user } = await workos().userManagement.authenticateWithCode({
    code,
    clientId: env.WORKOS_CLIENT_ID,
    session: {
      sealSession: true,
      cookiePassword: env.WORKOS_COOKIE_PASSWORD,
    },
  });

  if (sealedSession) {
    setCookie(COOKIE_NAME, sealedSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return {
    workosId: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const sealed = getCookie(COOKIE_NAME);
  if (!sealed) return null;

  const session = workos().userManagement.loadSealedSession({
    sessionData: sealed,
    cookiePassword: env.WORKOS_COOKIE_PASSWORD,
  });

  const result = await session.authenticate();
  if (!result.authenticated) return null;

  const user = result.user;
  return {
    workosId: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

export function clearSession() {
  deleteCookie(COOKIE_NAME, { path: "/" });
}
