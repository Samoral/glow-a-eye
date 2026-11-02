import type { Finding } from "./recommend";
const BASE = "https://yce-api-01.makeupar.com";
const CONCERNS = (process.env.YOUCAM_CONCERNS ?? "acne,pore,texture,wrinkle,moisture,oiliness,redness,age_spot").split(",").map(s => s.trim()).filter(Boolean);
export class YouCamError extends Error { constructor(public code: string, message: string, public status = 502) { super(message); } }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const IMAGE_HINTS: Record<string, string> = {
  error_below_min_image_size: "The photo resolution is too small. Try again.",
  error_exceed_max_image_size: "The photo is too large. Try again.",
  error_src_face_too_small: "Your face is too small in the photo. Hold the phone closer so your face fills most of the width.",
  error_src_face_out_of_bound: "Part of your face is outside the frame. Center your face and try again.",
  error_lighting_dark: "The lighting is too dark. Move somewhere brighter with even light and try again.",
};
function classify(status: number, body: any): YouCamError {
  const msg = String(body?.error ?? body?.message ?? ""), code = String(body?.error_code ?? body?.error ?? "");
  if (status === 401 || status === 403) return new YouCamError("bad_key", "The YouCam API key was rejected. Please check the server configuration.");
  if (status === 402 || /unit|credit|quota|insufficient/i.test(msg + code)) return new YouCamError("no_credits", "The YouCam account has no analysis credits left.");
  if (IMAGE_HINTS[code]) return new YouCamError("bad_image", IMAGE_HINTS[code], 422);
  return new YouCamError("api_error", `YouCam returned an error${msg ? ": " + msg : ""}.`);
}

async function yc(path: string, init: RequestInit = {}) {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError("no_key", "The YouCam API key is not configured on the server.", 500);
  let res: Response;
  try { res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }); }
  catch { throw new YouCamError("network", "I could not reach the YouCam service."); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (typeof body.status === "number" && body.status >= 400)) throw classify(res.status, body);
  return body;
}

// Image bytes live only in memory for this request; nothing is written to disk.
export async function analyzeSkin(img: Buffer, contentType: string): Promise<Finding[]> {
  const meta = await yc("/s2s/v2.0/file", { method: "POST", body: JSON.stringify({ files: [{ content_type: contentType, file_name: "selfie.jpg", file_size: img.length }] }) });
  const file = meta.data?.files?.[0], up = file?.requests?.[0];
  if (!file?.file_id || !up?.url) throw new YouCamError("api_error", "YouCam did not return upload instructions.");
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(up.headers ?? {})) if (k.toLowerCase() !== "content-length") headers[k] = String(v);
  const put = await fetch(up.url, { method: up.method ?? "PUT", headers, body: img }).catch(() => null);
  if (!put?.ok) throw new YouCamError("upload_failed", "Uploading the photo to YouCam failed.");

  const task = await yc("/s2s/v2.1/task/skin-analysis", { method: "POST", body: JSON.stringify({ src_file_id: file.file_id, dst_actions: CONCERNS, format: "json" }) });
  const id = task.data?.task_id;
  if (!id) throw new YouCamError("api_error", "YouCam did not return a task id.");

  for (let i = 0; i < 25; i++) {
    await sleep(2000);
    const s = await yc(`/s2s/v2.1/task/skin-analysis/${encodeURIComponent(id)}`);
    const st = s.data?.task_status;
    if (st === "success") {
      const out: any[] = s.data?.results?.output ?? [];
      return out.filter(o => typeof o?.type === "string" && typeof o?.ui_score === "number")
        .map(o => ({ type: o.type, ui: o.ui_score, raw: typeof o.raw_score === "number" ? o.raw_score : null }));
    }
    if (st === "error") throw classify(200, { error: s.data?.error, error_code: s.data?.error, message: s.data?.error_message });
  }
  throw new YouCamError("timeout", "The analysis took too long.", 504);
}
