import { env } from "cloudflare:workers";

// Runtime secrets only. Never import this module from a client component.
export function setting(name: string): string {
  return String((env as unknown as Record<string, unknown>)[name] ?? process.env[name] ?? "").trim();
}
export function libraryProvider(): "d1" | "supabase" {
  const provider = setting("LIBRARY_DATABASE") || "d1";
  if (provider !== "d1" && provider !== "supabase") throw new Error("Invalid LIBRARY_DATABASE");
  return provider;
}
export function originalProvider(): "binding" | "s3" {
  const provider = setting("ORIGINAL_STORAGE") || "binding";
  if (provider !== "binding" && provider !== "s3") throw new Error("Invalid ORIGINAL_STORAGE");
  return provider;
}
export function imagesEnabled() { return setting("CF_IMAGES_ENABLED") === "true"; }
