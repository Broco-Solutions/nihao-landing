const configuredApiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (!configuredApiOrigin) return path;
  return `${configuredApiOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}

export const authApiUrl = process.env.NEXT_PUBLIC_AUTH_URL?.trim().replace(/\/$/, "") || apiUrl("/api/auth");
