const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function publicBase(url: URL) {
  return url.pathname === "/" ? url.origin : url.origin + url.pathname;
}

export function resolvePublicAppUrl(environment: Record<string, string | undefined> = process.env) {
  const production = environment.NODE_ENV === "production";
  const configured = normalizeUrl(environment.APP_URL);
  if (configured && (!production || !LOCAL_HOSTS.has(configured.hostname))) return publicBase(configured);

  for (const value of [environment.VERCEL_PROJECT_PRODUCTION_URL, environment.VERCEL_URL]) {
    const vercel = normalizeUrl(value);
    if (vercel) return publicBase(vercel);
  }

  return production ? "https://images-moments.vercel.app" : "http://localhost:5173";
}
