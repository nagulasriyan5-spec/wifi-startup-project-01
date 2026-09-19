export const Session = {
  cookieName: "sriyan_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
} as const;

export const Legal = {
  ownerName: "SRIYAN",
  copyright:
    "Copyright 2026 Sriyan. Founder CEO: SRIYAN. All rights reserved.",
} as const;
