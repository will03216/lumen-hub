"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  subscribeStories,
  getStoriesSnapshot,
  getStoriesServerSnapshot,
  createStory,
  deleteStory,
  type StoryMeta,
} from "@/lib/story/stories";

export function StoriesShell() {
  const router = useRouter();
  const stories = React.useSyncExternalStore(
    subscribeStories,
    getStoriesSnapshot,
    getStoriesServerSnapshot,
  );

  function handleNew() {
    const story = createStory({ name: "Untitled Story" });
    router.push(`/story/${story.id}`);
  }

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-5 px-7 pb-6 pt-8 md:grid-cols-[1fr_auto] md:gap-6 md:pt-10">
          <div>
            <span className="plate inline-flex">§ STORY · WORKSHOP</span>
            <h1
              className="font-serif mt-3 text-ink"
              style={{
                fontSize: "clamp(40px, 6vw, 80px)",
                letterSpacing: "-0.02em",
                lineHeight: 0.95,
              }}
            >
              Turn a story into a <span className="italic">film.</span>
            </h1>
          </div>
          <div className="flex items-end justify-end">
            <Button variant="primary" size="md" onClick={handleNew}>
              New Story →
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-[1440px] px-7 pt-10 pb-16">
        {stories === null || stories.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <StoryGrid stories={stories} onNew={handleNew} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mute">
        No stories yet
      </div>
      <p className="max-w-[360px] text-[15px] leading-relaxed text-ink-dim">
        Write a story or script, break it into scenes, generate a clip for
        each, then stitch them into a 1-minute film.
      </p>
      <Button variant="primary" size="md" onClick={onNew}>
        Write your first story →
      </Button>
    </div>
  );
}

function StoryGrid({
  stories,
  onNew,
}: {
  stories: StoryMeta[];
  onNew: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          {stories.length} {stories.length === 1 ? "story" : "stories"}
        </span>
        <Button variant="default" size="sm" onClick={onNew}>
          + New Story
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stories.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>
    </div>
  );
}

function StoryCard({ story }: { story: StoryMeta }) {
  const [confirming, setConfirming] = React.useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    deleteStory(story.id);
  }

  const relativeDate = formatRelative(story.updatedAt);

  return (
    <Link
      href={`/story/${story.id}`}
      className="group relative flex flex-col gap-3 rounded-[14px] border border-border bg-panel p-4 transition-colors hover:border-border-strong"
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-serif italic text-[16px] text-ink leading-snug line-clamp-2">
          {story.name}
        </span>
        <button
          onClick={handleDelete}
          className="shrink-0 mt-0.5 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute hover:text-[oklch(0.72_0.22_15)] transition-colors"
          title="Delete story"
        >
          {confirming ? "Sure?" : "✕"}
        </button>
      </div>

      {/* Meta */}
      <div className="mt-auto font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
        {relativeDate}
      </div>
    </Link>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
