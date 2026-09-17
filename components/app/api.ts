import { apiUrl } from "@/lib/api/origin";

export async function appApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), { cache: "no-store", credentials: "include", ...init });
  const payload = response.status === 204 ? {} : await response.json() as T & { error?: string };
  if (response.status === 401) {
    window.location.assign("/cuenta/ingresar");
    throw new Error("Tu sesión venció. Volvé a ingresar.");
  }
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? "No se pudo completar la operación");
  return payload as T;
}
