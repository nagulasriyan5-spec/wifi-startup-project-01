import type { wifiSessions, wifiTickets } from "@db/schema";

export type TicketSessionPolicyRow = Pick<
  typeof wifiSessions.$inferSelect,
  "id" | "deviceFingerprint" | "macAddress" | "status" | "startedAt"
>;

type TicketStatus = typeof wifiTickets.$inferSelect["status"];

function sessionDeviceKey(session: TicketSessionPolicyRow) {
  return session.deviceFingerprint || session.macAddress || `session:${session.id}`;
}

function sessionMatchesDevice(session: TicketSessionPolicyRow, deviceIdentity: string) {
  return session.deviceFingerprint === deviceIdentity || session.macAddress === deviceIdentity;
}

export function normalizeDeviceIdentity(input: {
  deviceFingerprint?: string | null;
  macAddress?: string | null;
}) {
  return (input.deviceFingerprint?.trim() || input.macAddress?.trim() || "").slice(0, 255);
}

export function evaluateTicketSessionAccess(input: {
  sessions: TicketSessionPolicyRow[];
  maxDevices?: number | null;
  deviceIdentity: string;
  ticketStatus: TicketStatus;
}) {
  const maxDevices = Math.max(1, input.maxDevices ?? 1);
  const uniqueDeviceCount = new Set(input.sessions.map(sessionDeviceKey)).size;
  const isKnownDevice = Boolean(
    input.deviceIdentity && input.sessions.some((session) => sessionMatchesDevice(session, input.deviceIdentity)),
  );
  const existingActiveSession = input.deviceIdentity
    ? input.sessions.find(
        (session) => session.status === "active" && sessionMatchesDevice(session, input.deviceIdentity),
      )
    : undefined;

  if (existingActiveSession) {
    return {
      allow: true,
      isKnownDevice,
      uniqueDeviceCount,
      existingActiveSession,
      shouldMarkUsed: uniqueDeviceCount >= maxDevices,
    };
  }

  if (input.ticketStatus === "used" && !isKnownDevice) {
    return {
      allow: false,
      reason: "Ticket already used",
      isKnownDevice,
      uniqueDeviceCount,
      shouldMarkUsed: true,
    };
  }

  if (!isKnownDevice && uniqueDeviceCount >= maxDevices) {
    return {
      allow: false,
      reason: "Ticket device limit reached",
      isKnownDevice,
      uniqueDeviceCount,
      shouldMarkUsed: true,
    };
  }

  const nextUniqueDeviceCount = isKnownDevice ? uniqueDeviceCount : uniqueDeviceCount + 1;
  return {
    allow: true,
    isKnownDevice,
    uniqueDeviceCount,
    existingActiveSession,
    shouldMarkUsed: nextUniqueDeviceCount >= maxDevices,
  };
}
