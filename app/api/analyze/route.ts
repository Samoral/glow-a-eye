import { NextRequest, NextResponse } from "next/server";
import { analyzeSkin, YouCamError } from "@/lib/youcam";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const type = (req.headers.get("content-type") ?? "").split(";")[0];
  if (type !== "image/jpeg" && type !== "image/png") return NextResponse.json({ code: "bad_image", message: "Please send a JPEG or PNG photo." }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > 10_000_000) return NextResponse.json({ code: "bad_image", message: "The photo was empty or larger than ten megabytes." }, { status: 400 });
  try {
    return NextResponse.json({ findings: await analyzeSkin(buf, type) });
  } catch (e) {
    const err = e instanceof YouCamError ? e : new YouCamError("unknown", "Something unexpected went wrong.");
    return NextResponse.json({ code: err.code, message: err.message }, { status: err.status });
  }
}
