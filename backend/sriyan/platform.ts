import { env } from "../lib/env";
import type { UserProfile } from "./types";

async function sriyanRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T | null> {
  const resp = await fetch(`${env.sriyanOpenUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.warn(
      `[sriyan] Request to ${path} failed (${resp.status}): ${text}`,
    );
    return null;
  }
  return resp.json() as Promise<T>;
}

export const users = {
  getProfile: (token: string) =>
    sriyanRequest<UserProfile>("/v1/users/me/profile", token),
};
