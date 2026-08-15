import { NextResponse } from "next/server";
import { prisma } from "@movewise/db";
import { getSession } from "../../../lib/auth";

/**
 * Closes the "no account export" gap in docs/known-risks.md. A Route
 * Handler rather than a Server Action, since this needs to hand back a
 * downloadable file with real response headers, not a form-state object.
 */
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: user.id },
    select: { lessonId: true, xpEarned: true, mistakes: true, completedAt: true },
    orderBy: { completedAt: "asc" },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.createdAt },
    lessonCompletions: completions,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="movewise-data.json"',
    },
  });
}
