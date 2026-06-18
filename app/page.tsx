"use client";

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Database,
  Home,
  Loader2,
  Mail,
  MessageSquareText,
  Pin,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseListingsCsv } from "../lib/csv";
import type { BuyerCriteria, Criterion, ListingInput, ScoredListing, ToolEvent } from "../lib/types";

type ClientRecord = {
  id: string;
  name: string;
  pinned: boolean;
  narrative: string;
  criteria?: BuyerCriteria;
  listings: ListingInput[];
  scoredListings: ScoredListing[];
};

type ListingSearch = {
  city: string;
  state: string;
  priceMax: string;
  propertyType: string;
  lotAcresMin: string;
};

const emptyClient = (name = "New buyer"): ClientRecord => ({
  id: crypto.randomUUID(),
  name,
  pinned: false,
  narrative: "",
  listings: [],
  scoredListings: [],
});

const storageKey = "propertymatch.buyers.v1";

const initialEvents: ToolEvent[] = [
  {
    id: "criteria",
    label: "Buyer memory",
    detail: "Waiting for buyer notes",
    state: "idle",
  },
  {
    id: "listing-import",
    label: "Listing source",
    detail: "No rows imported",
    state: "idle",
  },
  {
    id: "scoring",
    label: "Match reasoning",
    detail: "Requires criteria and listings",
    state: "idle",
  },
  {
    id: "delivery",
    label: "Send lane",
    detail: "Email integration not connected",
    state: "blocked",
  },
];

function AppPage() {
  const [clients, setClients] = useState<ClientRecord[]>(() => [emptyClient()]);
  const [activeClientId, setActiveClientId] = useState(() => clients[0].id);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [buyerNameDraft, setBuyerNameDraft] = useState("");
  const [csvDraft, setCsvDraft] = useState("");
  const [listingSearch, setListingSearch] = useState<ListingSearch>({
    city: "Brenham",
    state: "TX",
    priceMax: "",
    propertyType: "",
    lotAcresMin: "",
  });
  const [events, setEvents] = useState<ToolEvent[]>(initialEvents);
  const [status, setStatus] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isSearchingListings, setIsSearchingListings] = useState(false);

  const activeClient = clients.find((client) => client.id === activeClientId) ?? clients[0];
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name)),
    [clients],
  );
  const readyToSend = activeClient.scoredListings.filter((listing) => listing.status === "ready_to_send");
  const needsReview = activeClient.scoredListings.filter((listing) => listing.status !== "ready_to_send");
  const mustHaveCount =
    activeClient.criteria?.criteria.filter(
      (criterion) => criterion.importance === "must_have" || criterion.importance === "dealbreaker",
    ).length ?? 0;

  const profileStrength = useMemo(() => {
    const count = activeClient.criteria?.criteria.length ?? 0;
    if (count === 0) return 0;
    return Math.min(100, 35 + count * 8);
  }, [activeClient.criteria]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) {
        setHasLoadedStorage(true);
        return;
      }

      const parsed = JSON.parse(saved) as { clients?: ClientRecord[]; activeClientId?: string };
      const savedClients = parsed.clients?.length ? parsed.clients : [emptyClient()];
      setClients(savedClients.map((client) => ({ ...client, pinned: Boolean(client.pinned) })));
      setActiveClientId(parsed.activeClientId ?? savedClients[0].id);
    } catch {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage access failures.
      }
    } finally {
      setHasLoadedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) return;

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          clients,
          activeClientId,
        }),
      );
    } catch {
      // Persistence is best-effort in restricted browser contexts.
    }
  }, [activeClientId, clients, hasLoadedStorage]);

  function updateActiveClient(updater: (client: ClientRecord) => ClientRecord) {
    setClients((current) =>
      current.map((client) => (client.id === activeClient.id ? updater(client) : client)),
    );
  }

  function updateEvent(id: string, patch: Partial<ToolEvent>) {
    setEvents((current) =>
      current.map((event) => (event.id === id ? { ...event, ...patch } : event)),
    );
  }

  function createClient() {
    const name = buyerNameDraft.trim() || "Unnamed buyer";
    const client = emptyClient(name);
    setClients((current) => [...current, client]);
    setActiveClientId(client.id);
    setBuyerNameDraft("");
    setCsvDraft("");
    setStatus("");
    setEvents(initialEvents);
  }

  function deleteClient(clientId: string) {
    setClients((current) => {
      if (current.length === 1) {
        const replacement = emptyClient();
        setActiveClientId(replacement.id);
        return [replacement];
      }

      const nextClients = current.filter((client) => client.id !== clientId);
      if (clientId === activeClientId) {
        setActiveClientId(nextClients[0].id);
      }
      return nextClients;
    });
  }

  function togglePinned(clientId: string) {
    setClients((current) =>
      current.map((client) => (client.id === clientId ? { ...client, pinned: !client.pinned } : client)),
    );
  }

  async function extractCriteria() {
    setStatus("");
    setIsExtracting(true);
    updateEvent("criteria", {
      state: "running",
      detail: "Calling configured AI model",
    });

    try {
      const response = await fetch("/api/criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: activeClient.name,
          narrative: activeClient.narrative,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Criteria extraction failed.");
      }

      updateActiveClient((client) => ({ ...client, criteria: body }));
      updateEvent("criteria", {
        state: "complete",
        detail: `${body.criteria.length} criteria captured`,
      });
    } catch (error) {
      updateEvent("criteria", {
        state: "blocked",
        detail: "Configuration or model call failed",
      });
      setStatus(error instanceof Error ? error.message : "Criteria extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  }

  function importListings() {
    const listings = parseListingsCsv(csvDraft);

    if (listings.length === 0) {
      setStatus("Paste a CSV export with headers like address, price, city, url, description, image_urls.");
      updateEvent("listing-import", {
        state: "blocked",
        detail: "No valid listing rows found",
      });
      return;
    }

    updateActiveClient((client) => ({ ...client, listings, scoredListings: [] }));
    updateEvent("listing-import", {
      state: "complete",
      detail: `${listings.length} listing rows imported`,
    });
    updateEvent("scoring", {
      state: "idle",
      detail: "Ready to score imported listings",
    });
    setStatus("");
  }

  async function searchLiveListings() {
    setStatus("");
    setIsSearchingListings(true);
    updateEvent("listing-import", {
      state: "running",
      detail: "Searching active sale listings",
    });

    try {
      const params = new URLSearchParams();
      Object.entries(listingSearch).forEach(([key, value]) => {
        if (value.trim()) params.set(key, value.trim());
      });

      const response = await fetch(`/api/listings/search?${params}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Listing search failed.");
      }

      const listings = (body.listings ?? []) as ListingInput[];
      updateActiveClient((client) => ({ ...client, listings, scoredListings: [] }));
      updateEvent("listing-import", {
        state: "complete",
        detail: `${listings.length} live listings imported`,
      });
      updateEvent("scoring", {
        state: "idle",
        detail: listings.length ? "Ready to score live listings" : "No listings found",
      });
    } catch (error) {
      updateEvent("listing-import", {
        state: "blocked",
        detail: "Live listing search failed",
      });
      setStatus(error instanceof Error ? error.message : "Listing search failed.");
    } finally {
      setIsSearchingListings(false);
    }
  }

  async function scoreListings() {
    if (!activeClient.criteria || activeClient.listings.length === 0) {
      setStatus("Criteria and imported listings are required before scoring.");
      return;
    }

    setStatus("");
    setIsScoring(true);
    updateEvent("scoring", {
      state: "running",
      detail: "Calling configured AI model",
    });

    try {
      const response = await fetch("/api/listings/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: activeClient.criteria,
          listings: activeClient.listings.slice(0, 10),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Listing scoring failed.");
      }

      updateActiveClient((client) => ({
        ...client,
        scoredListings: body.scoredListings ?? [],
      }));
      updateEvent("scoring", {
        state: "complete",
        detail: `${body.scoredListings?.length ?? 0} listings scored`,
      });
    } catch (error) {
      updateEvent("scoring", {
        state: "blocked",
        detail: "Configuration or model call failed",
      });
      setStatus(error instanceof Error ? error.message : "Listing scoring failed.");
    } finally {
      setIsScoring(false);
    }
  }

  function updateCriterion(index: number, patch: Partial<Criterion>) {
    if (!activeClient.criteria) return;

    const criteria = activeClient.criteria.criteria.map((criterion, criterionIndex) =>
      criterionIndex === index ? { ...criterion, ...patch } : criterion,
    );

    updateActiveClient((client) => ({
      ...client,
      criteria: {
        ...client.criteria!,
        criteria,
      },
    }));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Home size={20} />
          </div>
          <div>
            <strong>PropertyMatch Pro</strong>
            <span>Agent workspace</span>
          </div>
        </div>

        <div className="create-row">
          <input
            value={buyerNameDraft}
            onChange={(event) => setBuyerNameDraft(event.target.value)}
            placeholder="Buyer name"
          />
          <button aria-label="Create buyer" onClick={createClient}>
            <Plus size={18} />
          </button>
        </div>

        <nav className="client-list" aria-label="Buyer profiles">
          {sortedClients.map((client) => (
            <div
              key={client.id}
              className={client.id === activeClient.id ? "client-button active" : "client-button"}
            >
              <button
              className="client-select"
              onClick={() => {
                setActiveClientId(client.id);
                setCsvDraft("");
                setStatus("");
              }}
            >
                <span>{client.name}</span>
                <small>{client.scoredListings.length} scored</small>
              </button>
              <button
                aria-label={client.pinned ? `Unpin ${client.name}` : `Pin ${client.name}`}
                className={client.pinned ? "icon-action active" : "icon-action"}
                onClick={() => togglePinned(client.id)}
              >
                <Pin size={14} />
              </button>
              <button
                aria-label={`Delete ${client.name}`}
                className="icon-action danger-action"
                onClick={() => deleteClient(client.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </nav>

        <div className="system-panel">
          <span>Profile strength</span>
          <div className="meter">
            <div style={{ width: `${profileStrength}%` }} />
          </div>
          <strong>{profileStrength}%</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Buyer command center</span>
            <h1>{activeClient.name}</h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={scoreListings} disabled={isScoring}>
              {isScoring ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
              Score matches
            </button>
            <button className="primary-button" disabled={readyToSend.length === 0}>
              <Send size={17} />
              Send queue
            </button>
          </div>
        </header>

        <section className="signal-strip" aria-label="Search state">
          <div>
            <Sparkles size={18} />
            <span>Criteria</span>
            <strong>{activeClient.criteria?.criteria.length ?? 0}</strong>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>Must-haves</span>
            <strong>{mustHaveCount}</strong>
          </div>
          <div>
            <Database size={18} />
            <span>Listings</span>
            <strong>{activeClient.listings.length}</strong>
          </div>
          <div>
            <Send size={18} />
            <span>Ready</span>
            <strong>{readyToSend.length}</strong>
          </div>
        </section>

        {status ? (
          <div className="alert">
            <AlertCircle size={18} />
          <span>{status}</span>
          </div>
        ) : null}

        <div className="workbench-grid">
          <section className="workbench-column">
            <section className="panel chat-panel">
              <div className="panel-heading">
                <div>
                  <MessageSquareText size={18} />
                  <h2>Buyer Notes</h2>
                </div>
                <span className="live-pill">
                  <Bot size={14} />
                  AI ready
                </span>
              </div>
              <div className="assistant-card">
                <Sparkles size={18} />
                <span>{activeClient.criteria ? "Profile built from buyer notes" : "Waiting for buyer notes"}</span>
              </div>
              <textarea
                value={activeClient.narrative}
                onChange={(event) =>
                  updateActiveClient((client) => ({ ...client, narrative: event.target.value }))
                }
                placeholder="Example: They want acreage near Brenham, privacy, no floodplain..."
              />
              <button className="primary-button full" onClick={extractCriteria} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                Build profile
              </button>
            </section>

            <section className="panel criteria-panel">
              <div className="panel-heading">
                <div>
                  <ClipboardList size={18} />
                  <h2>Search Profile</h2>
                </div>
                {activeClient.criteria ? <span className="live-pill calm">Editable</span> : null}
              </div>
              {activeClient.criteria ? (
                <>
                  <p className="summary">{activeClient.criteria.summary}</p>
                  <div className="criteria-list">
                    {activeClient.criteria.criteria.map((criterion, index) => (
                      <div className="criterion-row" key={criterion.id}>
                        <input
                          className={`importance-${criterion.importance}`}
                          value={criterion.label}
                          onChange={(event) => updateCriterion(index, { label: event.target.value })}
                        />
                        <select
                          value={criterion.importance}
                          onChange={(event) =>
                            updateCriterion(index, {
                              importance: event.target.value as Criterion["importance"],
                            })
                          }
                        >
                          <option value="must_have">Must-have</option>
                          <option value="strong_preference">Strong</option>
                          <option value="nice_to_have">Nice</option>
                          <option value="dealbreaker">Dealbreaker</option>
                          <option value="unknown">Unknown</option>
                        </select>
                        <textarea
                          value={criterion.detail}
                          onChange={(event) => updateCriterion(index, { detail: event.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={<CircleDashed size={24} />} title="No criteria extracted" />
              )}
            </section>
          </section>

          <section className="workbench-column">
            <section className="panel import-panel">
              <div className="panel-heading">
                <div>
                  <Upload size={18} />
                  <h2>Listing Source</h2>
                </div>
                <span className="live-pill calm">{activeClient.listings.length} rows</span>
              </div>
              <div className="listing-search-grid">
                <input
                  value={listingSearch.city}
                  onChange={(event) =>
                    setListingSearch((current) => ({ ...current, city: event.target.value }))
                  }
                  placeholder="City"
                />
                <input
                  value={listingSearch.state}
                  onChange={(event) =>
                    setListingSearch((current) => ({ ...current, state: event.target.value }))
                  }
                  placeholder="State"
                  maxLength={2}
                />
                <input
                  value={listingSearch.priceMax}
                  onChange={(event) =>
                    setListingSearch((current) => ({ ...current, priceMax: event.target.value }))
                  }
                  placeholder="Max price"
                  inputMode="numeric"
                />
                <input
                  value={listingSearch.lotAcresMin}
                  onChange={(event) =>
                    setListingSearch((current) => ({ ...current, lotAcresMin: event.target.value }))
                  }
                  placeholder="Min acres"
                  inputMode="decimal"
                />
                <select
                  value={listingSearch.propertyType}
                  onChange={(event) =>
                    setListingSearch((current) => ({ ...current, propertyType: event.target.value }))
                  }
                >
                  <option value="">Any type</option>
                  <option value="Single Family">Single Family</option>
                  <option value="Land">Land</option>
                  <option value="Multi-Family">Multi-Family</option>
                  <option value="Manufactured">Manufactured</option>
                </select>
                <button className="primary-button" onClick={searchLiveListings} disabled={isSearchingListings}>
                  {isSearchingListings ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
                  Search live
                </button>
              </div>
              <textarea
                value={csvDraft}
                onChange={(event) => setCsvDraft(event.target.value)}
                placeholder="address,price,city,url,description,image_urls"
              />
              <button className="secondary-button full" onClick={importListings}>
                <Upload size={17} />
                Import CSV
              </button>
            </section>

            <section className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <ShieldCheck size={18} />
                  <h2>Work Log</h2>
                </div>
              </div>
              <div className="event-list">
                {events.map((event) => (
                  <div className="event-row" key={event.id}>
                    <EventIcon state={event.state} />
                    <div>
                      <strong>{event.label}</strong>
                      <span>{event.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className="panel queue-panel">
            <div className="results-header">
              <div>
                <span className="eyebrow">Match queue</span>
                <h2>{activeClient.scoredListings.length} scored listings</h2>
              </div>
              <div className="result-counts">
                <span>{readyToSend.length} ready</span>
                <span>{needsReview.length} review</span>
              </div>
            </div>

            {activeClient.scoredListings.length > 0 ? (
              <div className="listing-grid">
                {activeClient.scoredListings.map((listing) => (
                  <ListingCard listing={listing} key={listing.id} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Search size={24} />} title="No scored listings yet" />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
    </div>
  );
}

function EventIcon({ state }: { state: ToolEvent["state"] }) {
  if (state === "complete") return <CheckCircle2 className="success" size={18} />;
  if (state === "blocked") return <XCircle className="danger" size={18} />;
  if (state === "running") return <Loader2 className="spin" size={18} />;
  return <CircleDashed className="muted" size={18} />;
}

function ListingCard({ listing }: { listing: ScoredListing }) {
  const image = listing.imageUrls[0];

  return (
    <article className="listing-card">
      <div className="listing-media">
        {image ? <img src={image} alt={listing.address} /> : <div className="no-image">No photo</div>}
        <div className={`score-badge ${listing.status}`}>
          <strong>{listing.score}</strong>
          <span>%</span>
        </div>
      </div>
      <div className="listing-body">
        <div>
          <h3>{listing.address}</h3>
          <p>{[listing.city, listing.price].filter(Boolean).join(" · ")}</p>
        </div>
        <p className="listing-summary">{listing.summary}</p>
        <TagList title="Matched" items={listing.matchedCriteria} />
        <TagList title="Concerns" items={listing.concerns} tone="warn" />
        <TagList title="Missing" items={listing.missingMustHaves} tone="danger" />
        <TagList title="Photo notes" items={listing.photoNotes} />
        <div className="listing-actions">
          {listing.url ? (
            <a href={listing.url} target="_blank" rel="noreferrer">
              Open listing
            </a>
          ) : (
            <span>No URL</span>
          )}
          <button>
            <Mail size={16} />
            Draft
          </button>
        </div>
      </div>
    </article>
  );
}

function TagList({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: unknown;
  tone?: "default" | "warn" | "danger";
}) {
  const safeItems = Array.isArray(items)
    ? items.map((item) => String(item)).filter(Boolean)
    : typeof items === "string" && items.trim()
      ? [items.trim()]
      : [];

  if (!safeItems.length) return null;

  return (
    <div className="tag-group">
      <span>{title}</span>
      <div>
        {safeItems.slice(0, 4).map((item) => (
          <small className={`tag ${tone}`} key={item}>
            {item}
          </small>
        ))}
      </div>
    </div>
  );
}

export default AppPage;
