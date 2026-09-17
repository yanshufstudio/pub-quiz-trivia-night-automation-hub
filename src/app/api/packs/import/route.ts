import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPackFromGenerated } from "@/lib/create-pack";
import { getOrCreateCreator } from "@/lib/creator";
import { MAX_MEDIA_PER_PACK, prepareImageForStorage } from "@/lib/media";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION, packFileSchema, type PackFile } from "@/lib/pack-file";
import { rateLimit } from "@/lib/rate-limit";

const MAX_IMPORT_BYTES = 120 * 1024 * 1024;

/**
 * Attaches each question's embedded `image` (a v2 file only — v1 has none)
 * to the row `createPackFromGenerated` just created for it. `POST
 * /api/packs/import` is unauthenticated, so this base64 blob is exactly as
 * hostile as an upload's request body and goes through the very same
 * `prepareImageForStorage` — sniff, decode, re-encode, strip metadata — as
 * `POST /api/questions/[id]/media`. An image that fails that (bad base64,
 * unsupported format, corrupt, oversized, wrong dimensions) is dropped
 * rather than failing the whole import: "degrade, don't reject", the same
 * choice `degradeInvalidMultipleChoice` makes for a bad option set — a host
 * re-importing a 40-question pack should not lose it over one bad picture.
 * The per-pack cap is enforced here exactly as on upload, so a file can't
 * hand a pack more images than the API would ever let it accumulate.
 */
async function attachImportedMedia(
  createdRounds: { questions: { id: string; index: number }[] }[],
  fileRounds: PackFile["rounds"]
) {
  let attached = 0;
  for (let r = 0; r < createdRounds.length; r++) {
    // createPackFromGenerated's own query doesn't order `questions` (only
    // `rounds`), so this doesn't lean on default row order to line a
    // question back up with its position in the file — it sorts on the
    // `index` createPackFromGenerated itself assigned from that same
    // position, which is guaranteed to match.
    const createdQuestions = [...createdRounds[r].questions].sort((a, b) => a.index - b.index);
    const fileQuestions = fileRounds[r]?.questions ?? [];
    for (let q = 0; q < createdQuestions.length; q++) {
      const image = fileQuestions[q]?.image;
      if (!image) continue;
      if (attached >= MAX_MEDIA_PER_PACK) break;

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(Buffer.from(image.data, "base64"));
      } catch {
        continue;
      }
      if (bytes.length === 0) continue;

      const prepared = await prepareImageForStorage(bytes);
      if (!prepared.ok) continue;

      const { mime, width, height, byteSize, bytes: storedBytes } = prepared.info;
      await db.questionMedia.create({
        data: {
          questionId: createdQuestions[q].id,
          mime,
          bytes: new Uint8Array(storedBytes),
          byteSize,
          width,
          height,
        },
      });
      attached += 1;
    }
  }
}

export async function POST(req: NextRequest) {
  // No AI call, so it doesn't count against the free-tier generation cap —
  // but it's an unauthenticated write, so it gets the same ceiling as seed.
  const limited = await rateLimit(req, "packs:import", { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many packs imported recently. Please wait a bit and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
    );
  }

  // Cheap first line against a multi-megabyte body: the biggest legitimate
  // file (500 questions, 40 images at the 2 MB cap, base64) is well under
  // this, and JSON.parse on anything larger is work spent on nothing.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "That pack file is too large to import." }, { status: 413 });
  }

  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "That isn't a JSON pack file." }, { status: 400 });
  }

  const parsed = packFileSchema.safeParse(body);
  if (!parsed.success) {
    const { format, version } = body as { format?: unknown; version?: unknown };
    const error =
      format !== PACK_FILE_FORMAT
        ? `That isn't a pack file exported from this app (expected format "${PACK_FILE_FORMAT}").`
        : version !== 1 && version !== PACK_FILE_VERSION
          ? `This pack file is version ${String(version)}; this app reads versions 1 and ${PACK_FILE_VERSION}.`
          : "This pack file is missing or has invalid questions. Re-export it and try again.";
    return NextResponse.json({ error }, { status: 400 });
  }

  // The importer owns the copy — this is how a visitor turns a shared
  // (ownerless) pack into one they can edit. Creating a Creator row here is
  // the same cost as on generate, and only happens on a successful parse.
  const { creator, setCookieOn } = await getOrCreateCreator(req);
  const { title, prompt, rounds } = parsed.data;
  const pack = await createPackFromGenerated({ title, rounds }, prompt ?? `Imported pack: ${title}`, creator.id);
  // A v1 file has no `image` field on any question, so this is a no-op for
  // one — the loop finds nothing to attach and returns immediately.
  await attachImportedMedia(pack.rounds, rounds);
  const res = NextResponse.json({ pack }, { status: 201 });
  setCookieOn(res);
  return res;
}
