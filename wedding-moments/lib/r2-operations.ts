import { setting } from "@/lib/cloud-config";

// Cloudflare bills R2 operations by class; mapping from developers.cloudflare.com/r2/pricing.
const CLASS_A = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload",
  "LifecycleStorageTierTransition", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"]);
const CLASS_B = new Set(["HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration"]);

export type R2Operations = { classA: number; classB: number; free: number; since: string; actions: { action: string; requests: number; kind: "A" | "B" | "free" }[] };

export function classifyOperations(groups: { action: string; requests: number }[], since: string): R2Operations {
  const total = (set: Set<string>) => groups.reduce((sum, g) => set.has(g.action) ? sum + g.requests : sum, 0);
  const classA = total(CLASS_A), classB = total(CLASS_B);
  const all = groups.reduce((sum, g) => sum + g.requests, 0);
  return { classA, classB, free: all - classA - classB, since, actions: groups.map(g => ({ ...g, kind: CLASS_A.has(g.action) ? "A" as const : CLASS_B.has(g.action) ? "B" as const : "free" as const })).sort((a, b) => b.requests - a.requests) };
}

// Current calendar month (UTC) — the R2 free tier resets monthly.
export async function readR2Operations(now = new Date()): Promise<R2Operations> {
  const token = setting("CLOUDFLARE_API_TOKEN"), account = setting("R2_ACCOUNT_ID");
  const bucket = setting("R2_BUCKET_NAME") || "wedding-originals";
  if (!token || !account) throw new Error("Chưa cấu hình CLOUDFLARE_API_TOKEN (quyền Account Analytics: Read).");
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const query = `query($account:String!,$since:Time!,$until:Time!,$bucket:String!){viewer{accounts(filter:{accountTag:$account}){r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$since,datetime_leq:$until,bucketName:$bucket}){sum{requests}dimensions{actionType}}}}}`;
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { account, since, until: now.toISOString(), bucket } }),
  });
  const body = await response.json().catch(() => null) as { data?: { viewer?: { accounts?: { r2OperationsAdaptiveGroups?: { sum: { requests: number }; dimensions: { actionType: string } }[] }[] } }; errors?: { message: string }[] } | null;
  if (!response.ok || body?.errors?.length) throw new Error(body?.errors?.[0]?.message ?? `Cloudflare GraphQL lỗi ${response.status}`);
  const groups = body?.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? [];
  return classifyOperations(groups.map(g => ({ action: g.dimensions.actionType, requests: g.sum.requests })), since);
}
