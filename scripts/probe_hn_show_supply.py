"""Bounded, read-only snapshot of official Hacker News Show story supply.

This measures raw source coverage for Arcli's account-discovery experiment. It
does not label stories as customer fit, buyer intent, or outreach-worthy leads.
The official API documents a rolling list of up to 200 Show stories:
https://github.com/HackerNews/API#ask-show-and-job-stories
"""

from __future__ import annotations

import argparse
import asyncio
import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx


API_ROOT = "https://hacker-news.firebaseio.com/v0"


async def _fetch_story(
    client: httpx.AsyncClient,
    story_id: int,
    semaphore: asyncio.Semaphore,
) -> dict[str, Any] | None:
    async with semaphore:
        try:
            response = await client.get(f"{API_ROOT}/item/{story_id}.json")
            response.raise_for_status()
            story = response.json()
        except (httpx.HTTPError, ValueError):
            return None
    return story if isinstance(story, dict) and story.get("type") == "story" else None


def _external_domain(story: dict[str, Any]) -> str | None:
    url = story.get("url")
    if not isinstance(url, str):
        return None
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not host:
        return None
    return None if host in {"news.ycombinator.com", "www.news.ycombinator.com"} else host


async def snapshot(limit: int) -> dict[str, Any]:
    """Summarize the latest bounded list without retaining story content."""

    async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
        response = await client.get(f"{API_ROOT}/showstories.json")
        response.raise_for_status()
        raw_ids = response.json()
        if not isinstance(raw_ids, list):
            raise ValueError("HN Show list did not return an array")
        story_ids = [item for item in raw_ids[:limit] if isinstance(item, int)]
        semaphore = asyncio.Semaphore(5)
        stories = await asyncio.gather(
            *(_fetch_story(client, story_id, semaphore) for story_id in story_ids)
        )

    valid = [story for story in stories if story and not story.get("deleted") and not story.get("dead")]
    now = datetime.now(timezone.utc).timestamp()
    timestamps = [
        float(story["time"])
        for story in valid
        if isinstance(story.get("time"), (int, float))
        and 0 < float(story["time"]) <= now
    ]
    external_domains = [domain for story in valid if (domain := _external_domain(story))]
    return {
        "source": "official_hn_showstories",
        "sampled_at_utc": datetime.fromtimestamp(now, timezone.utc).isoformat(),
        "requested_ids": len(story_ids),
        "readable_stories": len(valid),
        "fetch_failures_or_removed": len(story_ids) - len(valid),
        "stories_from_last_24h": sum(now - ts <= 86_400 for ts in timestamps),
        "stories_from_last_7d": sum(now - ts <= 604_800 for ts in timestamps),
        "oldest_sampled_age_hours": (
            round((now - min(timestamps)) / 3_600, 1) if timestamps else None
        ),
        "stories_with_external_url": len(external_domains),
        "distinct_external_domains": len(set(external_domains)),
        "repeated_external_domains": sum(
            count > 1 for count in Counter(external_domains).values()
        ),
        "interpretation": (
            "Raw rolling-list supply only; no fit, contact route, source rights, "
            "weekly completeness, or buyer intent established."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.limit <= 200:
        parser.error("--limit must be between 1 and 200")
    print(json.dumps(asyncio.run(snapshot(args.limit)), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
