// Next.js uses HTTP-backed Supabase/R2 providers. Native Worker bindings
// remain unavailable here so accidental D1/bucket usage fails explicitly.
export const env = {} as Cloudflare.Env;
