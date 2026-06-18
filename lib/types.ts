export type Criterion = {
  id: string;
  label: string;
  importance: "must_have" | "strong_preference" | "nice_to_have" | "dealbreaker" | "unknown";
  detail: string;
};

export type BuyerCriteria = {
  buyerName: string;
  summary: string;
  criteria: Criterion[];
  followUpQuestions: string[];
};

export type ListingInput = {
  id: string;
  address: string;
  price?: string;
  city?: string;
  url?: string;
  description?: string;
  imageUrls: string[];
};

export type ScoredListing = ListingInput & {
  score: number;
  status: "ready_to_send" | "review" | "blocked";
  summary: string;
  matchedCriteria: string[];
  concerns: string[];
  missingMustHaves: string[];
  photoNotes: string[];
};

export type ToolEvent = {
  id: string;
  label: string;
  detail: string;
  state: "idle" | "running" | "complete" | "blocked";
};
