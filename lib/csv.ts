import type { ListingInput } from "./types";

const expectedHeaders = new Set([
  "address",
  "price",
  "city",
  "url",
  "description",
  "image_urls",
  "imageurls",
  "photos",
]);

export function parseListingsCsv(raw: string): ListingInput[] {
  const rows = parseCsv(raw.trim());

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => normalizeHeader(header));
  const hasKnownHeader = headers.some((header) => expectedHeaders.has(header));

  if (!hasKnownHeader) {
    return [];
  }

  return rows.slice(1).map((row, index) => {
    const record = Object.fromEntries(
      headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]),
    );

    const imageField =
      record.image_urls ?? record.imageurls ?? record.photos ?? "";

    return {
      id: `listing-${index + 1}`,
      address: record.address || "Unknown address",
      price: record.price,
      city: record.city,
      url: record.url,
      description: record.description,
      imageUrls: splitImageUrls(imageField),
    };
  });
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function splitImageUrls(value: string) {
  return value
    .split(/[;\n|]+/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function parseCsv(raw: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  rows.push(row);

  return rows.filter((candidate) => candidate.some(Boolean));
}
