let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Cannot reach FairDrop. Check the server connection, then retry. Your form values are preserved.",
      0,
    );
  }
  const data = await response.json().catch(() => ({
    detail: "The server returned an unreadable response. Please retry.",
  }));
  if (!response.ok) {
    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail
          .map(
            (e: { loc: string[]; msg: string }) =>
              `${e.loc.filter((x) => x !== "body").join(" · ")}: ${e.msg}`,
          )
          .join(" ")
      : String(detail || "Request failed.");
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export const litres = (ml: number | null | undefined) =>
  ml == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(
        ml / 1000,
      );
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}${seconds % 60 ? ":" + (seconds % 60).toString().padStart(2, "0") : ""}`;
export const seconds = (value: FormDataEntryValue | null) => {
  const [h, m] = String(value).split(":").map(Number);
  return h * 3600 + m * 60;
};
export const ml = (value: FormDataEntryValue | null) => {
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001
  )
    throw new Error(
      "Enter a finite quantity with at most three decimal places.",
    );
  return Math.round(n * 1000);
};
export const timestamp = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bishkek",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(value))
    : "—";
export const dayLabel = (value: string) =>
  Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())
    ? "Choose a valid watering date"
    : new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T12:00:00Z`));
