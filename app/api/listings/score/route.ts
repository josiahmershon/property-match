import { NextResponse } from "next/server";
import { z } from "zod";
import { createJsonChatCompletion } from "../../../../lib/openai";
import type { ScoredListing } from "../../../../lib/types";

const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  importance: z.enum(["must_have", "strong_preference", "nice_to_have", "dealbreaker", "unknown"]),
  detail: z.string(),
});

const listingSchema = z.object({
  id: z.string(),
  address: z.string(),
  price: z.string().optional(),
  city: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  imageUrls: z.array(z.string()),
});

const requestSchema = z.object({
  criteria: z.object({
    buyerName: z.string(),
    summary: z.string(),
    criteria: z.array(criterionSchema),
    followUpQuestions: z.array(z.string()),
  }),
  listings: z.array(listingSchema).min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());

    const imageContent = payload.listings
      .flatMap((listing) => listing.imageUrls.slice(0, 2))
      .slice(0, 8)
      .map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      }));

    const result = await createJsonChatCompletion<{ scoredListings: ScoredListing[] }>([
      {
        role: "system",
        content:
          "You score real estate listings for an agent against buyer criteria. Return only JSON with key scoredListings. Each scored listing must include all original listing fields plus score number 0-100, status ready_to_send/review/blocked, summary, matchedCriteria, concerns, missingMustHaves, photoNotes. matchedCriteria, concerns, missingMustHaves, and photoNotes must always be arrays of short strings, even when there is only one item. If a must-have or dealbreaker is violated or unknown, use status review or blocked. Do not invent facts that are not in the description, URL data, or visible photos; put uncertainties in concerns.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              criteria: payload.criteria,
              listings: payload.listings.map((listing) => ({
                ...listing,
                imageUrls: listing.imageUrls.slice(0, 2),
              })),
            }),
          },
          ...imageContent,
        ],
      },
    ]);

    return NextResponse.json({
      scoredListings: (result.scoredListings ?? []).map((listing) => ({
        ...listing,
        score: Math.max(0, Math.min(100, Number(listing.score) || 0)),
        status: ["ready_to_send", "review", "blocked"].includes(listing.status)
          ? listing.status
          : "review",
        matchedCriteria: normalizeStringList(listing.matchedCriteria),
        concerns: normalizeStringList(listing.concerns),
        missingMustHaves: normalizeStringList(listing.missingMustHaves),
        photoNotes: normalizeStringList(listing.photoNotes),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not score listings." },
      { status: 400 },
    );
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}
