import { setting } from "./cloud-config";
const encoder=new TextEncoder();
function hex(buffer:ArrayBuffer){return [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function sha256(value:string){return hex(await crypto.subtle.digest("SHA-256",encoder.encode(value)))}
async function hmac(key:BufferSource,value:string){return crypto.subtle.sign("HMAC",await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]),encoder.encode(value))}
async function signingKey(secret:string,date:string,region:string){const d=await hmac(encoder.encode(`AWS4${secret}`),date);const r=await hmac(d,region);const s=await hmac(r,"s3");return hmac(s,"aws4_request")}
function encodePath(key:string){return key.split("/").map(encodeURIComponent).join("/")}
export async function createR2SignedUrl({method,key,contentType,expires=900,bucketName,filename}:{method:"GET"|"PUT"|"DELETE"|"HEAD";key:string;contentType?:string;expires?:number;bucketName?:string;filename?:string}){
  const account=setting("R2_ACCOUNT_ID"),access=setting("R2_ACCESS_KEY_ID"),secret=setting("R2_SECRET_ACCESS_KEY"),bucket=bucketName||setting("R2_BUCKET_NAME");
  if(!account||!access||!secret||!bucket) return null;
  if(!/^[a-f0-9]{32}$/i.test(account))throw new Error("Invalid R2 account ID");
  const now=new Date(),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,"");const short=amzDate.slice(0,8),region="auto",scope=`${short}/${region}/s3/aws4_request`,host=`${account}.r2.cloudflarestorage.com`,uri=`/${encodeURIComponent(bucket)}/${encodePath(key)}`;
  const signedHeaders=contentType?"content-type;host":"host";const headers=contentType?`content-type:${contentType}\nhost:${host}\n`:`host:${host}\n`;
  const query=new URLSearchParams({"X-Amz-Algorithm":"AWS4-HMAC-SHA256","X-Amz-Credential":`${access}/${scope}`,"X-Amz-Date":amzDate,"X-Amz-Expires":String(expires),"X-Amz-SignedHeaders":signedHeaders});
  if(filename)query.set("response-content-disposition",`attachment; filename*=UTF-8''${encodeURIComponent(filename.replace(/[\r\n]/g,""))}`);
  const encode=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const encoded=()=>[...query.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${encode(k)}=${encode(v)}`).join("&");
  const canonical=[method,uri,encoded(),headers,signedHeaders,"UNSIGNED-PAYLOAD"].join("\n");const stringToSign=["AWS4-HMAC-SHA256",amzDate,scope,await sha256(canonical)].join("\n");const signature=hex(await hmac(await signingKey(secret,short,region),stringToSign));query.set("X-Amz-Signature",signature);
  return `https://${host}${uri}?${encoded()}`;
}
