export const DEFAULT_UPI_ID = "merchant@upi";
const UPI_ID_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export function isPaidAmount(amount?: number | string | null) {
  return Number(amount ?? 0) > 0;
}

export function formatUpiAmount(amount: number | string) {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized < 0) return "0.00";
  return normalized.toFixed(2);
}

export function normalizeUpiId(upiId?: string | null) {
  return upiId?.trim() || DEFAULT_UPI_ID;
}

export function isValidUpiId(upiId?: string | null) {
  return UPI_ID_PATTERN.test(normalizeUpiId(upiId));
}

export function ticketConnectUrl(code: string) {
  const path = `/connect?code=${encodeURIComponent(code)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function ticketHotspotUrl(code: string) {
  const path = `/hotspot?code=${encodeURIComponent(code)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function ticketUpiTransactionRef(code: string) {
  return `SRIYAN-${code}`;
}

export function ticketUpiNote(code: string) {
  return `Sriyan WiFi token ${code}`;
}

export function ticketUpiPayload({
  code,
  amount,
  upiId,
  merchantName,
}: {
  code: string;
  amount: number | string;
  upiId: string;
  merchantName?: string | null;
}) {
  const payeeAddress = normalizeUpiId(upiId);
  const params = new URLSearchParams({
    pa: payeeAddress,
    pn: merchantName?.trim() || "Sriyan WiFi",
    tr: ticketUpiTransactionRef(code),
    tn: ticketUpiNote(code),
    am: formatUpiAmount(amount),
    cu: "INR",
    url: ticketHotspotUrl(code),
  });

  return `upi://pay?${params.toString()}`;
}

export function ticketQrPayload({
  code,
  amount,
  upiId,
  merchantName,
}: {
  code: string;
  amount?: number | string | null;
  upiId: string;
  merchantName?: string | null;
}) {
  if (!isPaidAmount(amount)) return ticketHotspotUrl(code);

  return ticketUpiPayload({
    code,
    amount: amount ?? 0,
    upiId,
    merchantName,
  });
}
