import { NextResponse } from "next/server";
import type { ListingInput } from "../../../../lib/types";

type RentCastListing = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  price?: number;
  listPrice?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  description?: string;
  url?: string;
  mlsNumber?: string;
  photos?: Array<string | { url?: string }>;
  imageUrls?: string[];
};

const acreInSquareFeet = 43560;

export async function GET(request: Request) {
  if (!process.env.RENTCAST_API_KEY) {
    return NextResponse.json({ error: "RENTCAST_API_KEY is not configured." }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const city = searchParams.get("city")?.trim();
  const state = searchParams.get("state")?.trim().toUpperCase();
  const priceMax = searchParams.get("priceMax")?.trim();
  const propertyType = searchParams.get("propertyType")?.trim();
  const lotAcresMin = searchParams.get("lotAcresMin")?.trim();

  const rentCastParams = new URLSearchParams();

  if (city) rentCastParams.set("city", city);
  if (state) rentCastParams.set("state", state);
  if (propertyType) rentCastParams.set("propertyType", propertyType);
  if (priceMax) rentCastParams.set("price", `0-${priceMax}`);
  if (lotAcresMin) rentCastParams.set("lotSize", `${Number(lotAcresMin) * acreInSquareFeet}-`);

  rentCastParams.set("status", "Active");
  rentCastParams.set("limit", "12");

  const response = await fetch(`https://api.rentcast.io/v1/listings/sale?${rentCastParams}`, {
    headers: {
      Accept: "application/json",
      "X-Api-Key": process.env.RENTCAST_API_KEY,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `RentCast request failed: ${response.status} ${await response.text()}` },
      { status: response.status },
    );
  }

  const rawListings = (await response.json()) as RentCastListing[];
  const listings: ListingInput[] = rawListings.map((listing, index) => {
    const address =
      listing.formattedAddress ??
      [listing.addressLine1, listing.city, listing.state, listing.zipCode].filter(Boolean).join(", ") ??
      "Unknown address";
    const imageUrls = [
      ...(listing.imageUrls ?? []),
      ...((listing.photos ?? [])
        .map((photo) => (typeof photo === "string" ? photo : photo.url))
        .filter(Boolean) as string[]),
    ];

    return {
      id: listing.id ?? listing.mlsNumber ?? `rentcast-${index + 1}`,
      address,
      city: listing.city,
      price: listing.price || listing.listPrice ? `$${(listing.price ?? listing.listPrice)?.toLocaleString()}` : undefined,
      url: listing.url,
      description: [
        listing.description,
        listing.propertyType ? `Property type: ${listing.propertyType}` : "",
        listing.bedrooms ? `Bedrooms: ${listing.bedrooms}` : "",
        listing.bathrooms ? `Bathrooms: ${listing.bathrooms}` : "",
        listing.squareFootage ? `Square footage: ${listing.squareFootage}` : "",
        listing.lotSize ? `Lot size: ${Math.round(listing.lotSize).toLocaleString()} sq ft` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      imageUrls,
    };
  });

  return NextResponse.json({ listings });
}
