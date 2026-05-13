#!/usr/bin/env python3
"""One-time migration: import recipes from Link Manager SQLite into Supabase."""

import sqlite3
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://etcinynuwuzjqowvwpcy.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Y2lueW51d3V6anFvd3Z3cGN5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjU2MTY5MywiZXhwIjoyMDc4MTM3NjkzfQ.mQ9DnfNuPZ5p1J7XxSLB2brPfbokX8FwgSIppDlZwjc"
LINKS_DB = "/Users/kennychang/Scripts/Link Manager/links.db"

conn = sqlite3.connect(LINKS_DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("""
    SELECT url, title, description, image_url, favicon_url, domain, ingredients, steps, tags, text_snapshot, saved_at
    FROM links
    WHERE lower(category) = 'recipes'
    ORDER BY saved_at ASC
""")
rows = cur.fetchall()
conn.close()

print(f"Found {len(rows)} recipes to migrate")

headers = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

ok = 0
skipped = 0
errors = 0

for row in rows:
    try:
        ingredients = json.loads(row["ingredients"]) if row["ingredients"] else []
        steps = json.loads(row["steps"]) if row["steps"] else []
        tags = json.loads(row["tags"]) if row["tags"] else []
    except json.JSONDecodeError:
        ingredients, steps, tags = [], [], []

    record = {
        "url": row["url"],
        "title": row["title"] or "",
        "description": row["description"] or "",
        "image_url": row["image_url"] or "",
        "favicon_url": row["favicon_url"] or "",
        "domain": row["domain"] or "",
        "ingredients": ingredients,
        "steps": steps,
        "tags": tags,
        "text_snapshot": row["text_snapshot"] or "",
    }

    data = json.dumps(record).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/recipes",
        data=data,
        headers={**headers, "Prefer": "resolution=ignore-duplicates,return=minimal"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            if status in (200, 201):
                ok += 1
                print(f"  + {row['title'][:60]}")
            else:
                skipped += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "duplicate" in body.lower() or e.code == 409:
            skipped += 1
            print(f"  ~ skip (exists): {row['title'][:60]}")
        else:
            errors += 1
            print(f"  ! error {e.code} for {row['url']}: {body[:100]}")

print(f"\nDone: {ok} inserted, {skipped} skipped (duplicates), {errors} errors")
