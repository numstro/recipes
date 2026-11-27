#!/usr/bin/env python3
"""Fill prep/cook/total minutes for saved recipes by re-scraping their source URLs."""
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'api'))
from scrape import fetch_metadata  # noqa: E402

env = dict(
    line.split('=', 1) for line in (Path(__file__).resolve().parent.parent / '.env.local').read_text().splitlines()
    if '=' in line and not line.startswith('#')
)
BASE = env['NEXT_PUBLIC_SUPABASE_URL'].strip() + '/rest/v1/recipes'
KEY = env['SUPABASE_SERVICE_ROLE_KEY'].strip()
HEADERS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
FIELDS = ('prep_minutes', 'cook_minutes', 'total_minutes')


def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, headers=HEADERS, data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or 'null')


rows = call('GET', BASE + '?select=id,url,title,prep_minutes,cook_minutes,total_minutes'
            '&deleted_at=is.null&prep_minutes=is.null&cook_minutes=is.null&total_minutes=is.null&order=id')
rows = [r for r in rows if not r['url'].startswith('manual:')]
print(f'{len(rows)} recipes to check')

found = 0
for r in rows:
    try:
        meta = fetch_metadata(r['url'])
    except Exception as exc:
        print(f"  ✗ {r['title']}: {exc}")
        continue
    times = {k: meta.get(k) for k in FIELDS if meta.get(k) is not None}
    if not times:
        print(f"  – {r['title']}: no times listed")
        continue
    call('PATCH', f"{BASE}?id=eq.{r['id']}", times)
    found += 1
    print(f"  ✓ {r['title']}: {times}")

print(f'Done: {found}/{len(rows)} updated')
