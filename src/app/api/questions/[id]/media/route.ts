import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { requirePackOwner } from "@/lib/pack-access";
import { mayReadQuestionMedia } from "@/lib/question-media-access";
import { rateLimit } from "@/lib/rate-limit";
import { formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_PER_PACK, prepareImageForStorage } from "@/lib/media";

/**
 * The image attached to one question.
 *
 * `POST` and `DELETE` are the pack owner's: a signed-in account whose
 * Creator owns the pack (src/lib/auth-guard.ts, src/lib/pack-access.ts).
 *
 * `GET` takes a credential too, now. It was the last read in this app that
 * took none — anyone holding a question id got the bytes — which was
 * defensible while every pack read was open and stopped being so when they
 * stopped being. Who may fetch what is in src/lib/question-media-access.ts;
 * the short version is that the image goes to whoever the session state
 * would serve that question to, plus the host who may read the pack.
 *
 * A caller who may not read it gets the same 404 as a question that has no
 * image, so a question id cannot be probed for one.
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

  // After the limiter (an unauthenticated flood is bounded before it can
  // cost a session lookup) but before everything else: an upload is a pack
  // edit, and a pack now belongs to an account, not to a browser.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

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

  const question = await db.question.findUnique({
    where: { id },
    select: { id: true, round: { select: { packId: true } } },
  });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(host.creator.id, { questionId: id });
  if (forbidden) return forbidden;

  // The cap only applies to *new* images. Whether this question already has
  // one decides that: replacing it (the upsert below) never changes how many
  // images the pack holds, so a host reuploading a cropped version of an
  // existing image can't be blocked by the pack's own cap.
  const existing = await db.questionMedia.findUnique({ where: { questionId: id }, select: { id: true } });
  if (!existing) {
    const packMediaCount = await db.questionMedia.count({
      where: { question: { round: { packId: question.round.packId } } },
    });
    if (packMediaCount >= MAX_MEDIA_PER_PACK) {
      return NextResponse.json(
        { error: `This pack already has the maximum of ${MAX_MEDIA_PER_PACK} images.` },
        { status: 409 }
      );
    }
  }

  const body = await req.arrayBuffer().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Could not read the uploaded file" }, { status: 400 });
  }
  const bytes = new Uint8Array(body);

  // Sniffs the bytes, then re-encodes with sharp (strips EXIF/GPS, and a
  // decode-then-encode round trip is what neutralises a polyglot file) —
  // see src/lib/media.ts. This is the exact function pack import also calls,
  // so an uploaded image and an imported one are never held to different
  // standards.
  const prepared = await prepareImageForStorage(bytes);
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  }
  const { mime, width, height, byteSize, bytes: storedBytes } = prepared.info;
  // sharp's toBuffer() returns a Node Buffer<ArrayBufferLike>; Prisma's field
  // type wants a plain Uint8Array<ArrayBuffer>. Re-wrapping copies the bytes
  // into a fresh, non-shared ArrayBuffer, which is what satisfies that.
  const rowBytes = new Uint8Array(storedBytes);

  // One image per question: uploading again replaces it rather than
  // accumulating rows (QuestionMedia.questionId is unique).
  const media = await db.questionMedia.upsert({
    where: { questionId: id },
    create: { questionId: id, mime, bytes: rowBytes, byteSize, width, height },
    update: { mime, bytes: rowBytes, byteSize, width, height },
    select: { id: true, mime: true, byteSize: true, width: true, height: true },
  });

  return NextResponse.json({ media }, { status: 201 });
}

/** The one 404 this route answers with: "no image" and "not yours" are the
 * same answer, deliberately. */
function noImage() {
  return NextResponse.json({ error: "No image for this question" }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Before the row is read, not after: the row carries the bytes, and there
  // is no reason to pull an image into memory for a caller who is not going
  // to be given it.
  if (!(await mayReadQuestionMedia(req, id))) return noImage();

  const media = await db.questionMedia.findUnique({ where: { questionId: id } });
  if (!media) return noImage();

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
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();
  const { id } = await params;
  const existing = await db.questionMedia.findUnique({ where: { questionId: id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "No image for this question" }, { status: 404 });
  }
  const forbidden = await requirePackOwner(host.creator.id, { questionId: id });
  if (forbidden) return forbidden;

  await db.questionMedia.delete({ where: { questionId: id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
