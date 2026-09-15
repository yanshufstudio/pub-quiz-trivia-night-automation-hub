import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCreator } from "@/lib/creator";

/**
 * Returns the visitor's creator id, creating the Creator and setting the
 * pq_creator cookie if there is none. The pricing page needs the id before
 * checkout opens (it rides along as customData.creatorId so the webhook can
 * bind the subscription), and a server component cannot set cookies, so
 * this route handler does it on the page's behalf.
 */
export async function POST(req: NextRequest) {
  const { creator, setCookieOn } = await getOrCreateCreator(req);
  const res = NextResponse.json({ creatorId: creator.id, plan: creator.plan });
  setCookieOn(res);
  return res;
}
