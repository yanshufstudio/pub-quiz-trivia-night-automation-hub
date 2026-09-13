import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePackOwner } from "@/lib/pack-access";
import { rateLimit } from "@/lib/rate-limit";
import { formatBytes, MAX_MEDIA_BYTES, validateImageBytes } from "@/lib/media";

/**
 * The image attached to one question.
 *
 * `POST` and `DELETE` are the pack owner's, gated on the same `pq_creator`
 * ownership rule as every other pack edit (src/lib/pack-access.ts). `GET` is
 * open, exactly like `GET /api/packs/[id]` and the PDF route: a team's phone
 * and the printed sheet both have to render the image, and neither holds the
 * owner's cookie. Pack ids are unlisted cuids and that is the existing,
 * deliberate read model here — this route does not widen it, but it does
 * inherit it, so nothing private should ever be uploaded as a question image.
 *
 * The bytes are stored, never a URL. See src/lib/media.ts and the "Media
 * support" section of HANDOFF.md for why that is the whole point.
 */

/** The body is the raw image. No multipart, no JSON envelope, no filename —
 * there is nothing in a wrapper this route would be willing to trust, so it
 * does not parse one. The bytes decide what this is. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Ahead of the ownership check, because the expensive part of this request
  // is the body, and an unauthenticated flood should not get to send 2 MB a
  // time before being told no.
  const limited = await rateLimit(req, "questions:media", { limit: 40, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many uploads recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  // Advisory only — a lying or absent Content-Length is caught by the real
  // check on the bytes below. It is here so an oversized upload is refused
  // before it is read into memory, rather than after.
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: `Images must be ${formatBytes(MAX_MEDIA_BYTES)} or smaller` },
      { status: 413 }
    );
  }

  const question = await db.question.findUnique({ where: { id }, select: { id: true } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(req, { questionId: id });
  if (forbidden) return forbidden;

  const body = await req.arrayBuffer().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Could not read the uploaded file" }, { status: 400 });
  }
  const bytes = new Uint8Array(body);

  const validated = validateImageBytes(bytes);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { mime, width, height, byteSize } = validated.info;

  // One image per question: uploading again replaces it rather than
  // accumulating rows (QuestionMedia.questionId is unique).
  const media = await db.questionMedia.upsert({
    where: { questionId: id },
    create: { questionId: id, mime, bytes, byteSize, width, height },
    update: { mime, bytes, byteSize, width, height },
    select: { id: true, mime: true, byteSize: true, width: true, height: true },
  });

  return NextResponse.json({ media }, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await db.questionMedia.findUnique({ where: { questionId: id } });
  if (!media) {
    return NextResponse.json({ error: "No image for this question" }, { status: 404 });
  }

  // Replacing an image reuses the row, so the row's id alone would let a
  // stale copy live forever; updatedAt and the size are what actually change.
  const etag = `W/"${media.id}-${media.updatedAt.getTime()}-${media.byteSize}"`;
  const headers = {
    "Content-Type": media.mime,
    // Bytes someone uploaded, served from our own origin: pin the type we
    // derived from the magic number, refuse to let a browser sniff its way
    // to a different one, and give the response no privileges of its own.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
    // Revalidate rather than expire: a host who swaps an image mid-setup
    // must not be shown the old one, and a 40-image pack still costs 40
    // cheap 304s on reload rather than 40 full bodies.
    "Cache-Control": "private, no-cache",
    ETag: etag,
  };

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(new Uint8Array(media.bytes), {
    headers: { ...headers, "Content-Length": String(media.byteSize) },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await db.questionMedia.findUnique({ where: { questionId: id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "No image for this question" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(req, { questionId: id });
  if (forbidden) return forbidden;

  await db.questionMedia.delete({ where: { questionId: id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
