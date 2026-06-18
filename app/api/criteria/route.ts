import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonChatCompletion } from "../../../lib/openai";
import type { BuyerCriteria } from "../../../lib/types";

const requestSchema = z.object({
  buyerName: z.string().min(1),
  narrative: z.string().min(12),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());

    const result = await createJsonChatCompletion<BuyerCriteria>([
      {
        role: "system",
        content:
          "You extract real estate buyer search criteria for an agent. Return only JSON with keys buyerName, summary, criteria, followUpQuestions. Each criterion must have id, label, importance, and detail. importance must be one of must_have, strong_preference, nice_to_have, dealbreaker, unknown. Treat phrases like must have, nonnegotiable, cannot live without, avoid, never, no, or dealbreaker as hard requirements.",
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ]);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not extract criteria." },
      { status: 400 },
    );
  }
}
