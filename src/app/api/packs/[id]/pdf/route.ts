import { createElement, type ReactElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import {
  AnswerSheetDocument,
  PresenterScriptDocument,
  QuestionSheetDocument,
} from "@/lib/pdf/documents";
import { packWithRoundsAndMediaArgs, type PackWithRoundsAndMedia } from "@/lib/session-state";
import { hostSessionForRequest, unauthorized } from "@/lib/auth-guard";
import { canReadPack, packNotFound } from "@/lib/pack-access";

const DOCUMENTS = {
  questions: { Component: QuestionSheetDocument, suffix: "questions" },
  answers: { Component: AnswerSheetDocument, suffix: "answers" },
  script: { Component: PresenterScriptDocument, suffix: "presenter-script" },
} as const;

type DocType = keyof typeof DOCUMENTS;

function isDocType(value: string | null): value is DocType {
  return !!value && value in DOCUMENTS;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // These are the host's sheets and two of the three carry the answers, so
  // this route needs an account — and, since the second round of this
  // change, the *right* account. An ownerless pack (the demo) still prints
  // for anyone signed in; see canReadPack.
  const host = await hostSessionForRequest(req);
  if (!host) return unauthorized();

  const { id } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (!isDocType(type)) {
    return NextResponse.json(
      { error: "type must be one of: questions, answers, script" },
      { status: 400 }
    );
  }

  // The full media rows (mime + bytes), not the lightweight `hasMedia` shape
  // sessions poll with — documents.tsx inlines the bytes as a data: URI, and
  // that's the one form an image may reach @react-pdf/renderer in (see
  // src/test/pdf-media-offline.integration.test.ts).
  const pack = (await db.quizPack.findUnique({
    where: { id },
    ...packWithRoundsAndMediaArgs,
  })) as PackWithRoundsAndMedia | null;

  if (!pack || !canReadPack(pack, host.creator.id)) return packNotFound();

  const { Component, suffix } = DOCUMENTS[type];
  const element = createElement(Component, { pack }) as unknown as ReactElement<DocumentProps>;
  const stream = await renderToStream(element);

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  const filename = `${pack.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${suffix}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
