import { ValidationError } from "./validation.ts";

export function companyNameInput(value: unknown): { name: string; normalizedName: string } {
  if (typeof value !== "string") throw new ValidationError("Ingresá un nombre de empresa válido");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new ValidationError("Ingresá un nombre de empresa válido");
  return { name, normalizedName: name.toLocaleLowerCase("es") };
}
