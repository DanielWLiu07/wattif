import { EventsFeed } from "@/components/EventsFeed";

/**
 * Full-page, navbar-level Events surface. Reuses the rich EventsFeed (per-event
 * aftermath trend, shared-zone interaction links, resident chats) inside a
 * roomy centred column — a primary view, not a sidebar tab.
 */
export function EventsView() {
  return (
    <div className="pointer-events-auto flex h-full w-full justify-center overflow-hidden bg-background px-6 py-6">
      <div className="flex h-full w-full max-w-3xl flex-col">
        <div className="mb-4 shrink-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            City events
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every placement and scenario — the reactions it triggered, how
            sentiment evolved afterward, and how events ripple into one another.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
          <EventsFeed />
        </div>
      </div>
    </div>
  );
}
