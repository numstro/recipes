"""
Vercel Python serverless function — scrapes recipe metadata from a URL.
Port of /Users/kennychang/Scripts/Link Manager/metadata.py
"""
import re
import json as _json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urljoin, urlparse, parse_qs
import json

import requests
from bs4 import BeautifulSoup

FETCH_TIMEOUT = 15
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
    # No Accept-Encoding: brotli — Python requests can't decode it
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body)
            url = payload.get('url', '').strip()
        except Exception:
            self._respond(400, {'error': 'Invalid JSON body'})
            return

        if not url:
            self._respond(400, {'error': 'url is required'})
            return

        try:
            result = fetch_metadata(url)
            self._respond(200, result)
        except Exception as exc:
            self._respond(502, {'error': str(exc)})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _respond(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')


_FIRST_INT = re.compile(r'\d+')


def _parse_yield(raw) -> int | None:
    if isinstance(raw, list):
        raw = raw[0] if raw else None
    if raw is None:
        return None
    m = _FIRST_INT.search(str(raw))
    return int(m.group()) if m else None


def fetch_metadata(url: str) -> dict:
    result = {
        'url': url,
        'title': None,
        'description': None,
        'image_url': None,
        'favicon_url': None,
        'domain': None,
        'text_snapshot': None,
        'ingredients': [],
        'steps': [],
        'servings': None,
    }

    try:
        resp = requests.get(url, timeout=FETCH_TIMEOUT, headers=_HEADERS, allow_redirects=True)
        final_url = resp.url
        parsed = urlparse(final_url)
        result['url'] = final_url
        result['domain'] = parsed.netloc.removeprefix('www.')
    except Exception as exc:
        raise RuntimeError(f'Could not fetch URL: {exc}') from exc

    # Use raw bytes so BeautifulSoup reads encoding from <meta charset>,
    # not the HTTP header (which often incorrectly claims ISO-8859-1).
    soup = BeautifulSoup(resp.content, 'html.parser')

    og_title = _meta(soup, 'og:title')
    tw_title = _meta(soup, 'twitter:title')
    tag_title = soup.title.string.strip() if soup.title and soup.title.string else None
    result['title'] = og_title or tw_title or tag_title

    og_desc = _meta(soup, 'og:description')
    tw_desc = _meta(soup, 'twitter:description')
    plain_desc = _meta_name(soup, 'description')
    result['description'] = og_desc or tw_desc or plain_desc

    og_image = _meta(soup, 'og:image')
    tw_image = _meta(soup, 'twitter:image')
    raw_image = og_image or tw_image
    if raw_image:
        result['image_url'] = urljoin(final_url, raw_image)

    result['favicon_url'] = _find_favicon(soup, final_url)

    # Must run before _extract_text which calls decompose() on script tags
    result['ingredients'] = extract_ingredients(soup)
    result['steps'] = extract_steps(soup)
    result['servings'] = extract_servings(soup)

    result['text_snapshot'] = _extract_text(soup)

    if not result['title']:
        result['title'] = result['domain'] or url

    return result


def extract_servings(soup: BeautifulSoup) -> int | None:
    # Strategy 1: Schema.org JSON-LD recipeYield
    try:
        for tag in soup.find_all('script', type='application/ld+json'):
            try:
                data = _json.loads(tag.string or '')
            except Exception:
                continue
            if isinstance(data, dict) and '@graph' in data:
                candidates = data['@graph']
            elif isinstance(data, list):
                candidates = data
            else:
                candidates = [data]
            for obj in candidates:
                if not isinstance(obj, dict):
                    continue
                obj_type = obj.get('@type', '')
                types = obj_type if isinstance(obj_type, list) else [obj_type]
                if not any(t.lower() == 'recipe' for t in types if isinstance(t, str)):
                    continue
                raw = obj.get('recipeYield')
                if raw is not None:
                    parsed = _parse_yield(raw)
                    if parsed:
                        return parsed
    except Exception:
        pass

    # Strategy 2: microdata
    try:
        el = soup.find(attrs={'itemprop': 'recipeYield'})
        if el:
            text = el.get('content') or el.get_text(' ', strip=True)
            parsed = _parse_yield(text)
            if parsed:
                return parsed
    except Exception:
        pass

    return None


def extract_ingredients(soup: BeautifulSoup) -> list:
    # Strategy 1: Schema.org JSON-LD
    try:
        for tag in soup.find_all('script', type='application/ld+json'):
            try:
                data = _json.loads(tag.string or '')
            except Exception:
                continue
            if isinstance(data, dict) and '@graph' in data:
                candidates = data['@graph']
            elif isinstance(data, list):
                candidates = data
            else:
                candidates = [data]
            for obj in candidates:
                if not isinstance(obj, dict):
                    continue
                obj_type = obj.get('@type', '')
                types = obj_type if isinstance(obj_type, list) else [obj_type]
                if not any(t.lower() == 'recipe' for t in types if isinstance(t, str)):
                    continue
                raw = obj.get('recipeIngredient', [])
                result = []
                for item in raw:
                    if isinstance(item, str):
                        val = item.strip()
                    elif isinstance(item, dict):
                        val = item.get('name', '').strip()
                    else:
                        val = ''
                    if val:
                        result.append(val)
                if result:
                    return result
    except Exception:
        pass

    # Strategy 2: Microdata
    try:
        elements = soup.find_all(attrs={'itemprop': 'recipeIngredient'})
        if elements:
            result = [el.get_text(' ', strip=True) for el in elements]
            result = [r for r in result if r]
            if result:
                return result
    except Exception:
        pass

    # Strategy 3: CSS class heuristics
    try:
        ing_re = re.compile(r'ingredient', re.IGNORECASE)
        heading_re = re.compile(r'heading|header|title|group.?name|section.?name', re.IGNORECASE)
        skip_headings = re.compile(
            r'^(you will need|ingredients?|what you.?ll need|for the recipe)$',
            re.IGNORECASE
        )

        for container in soup.find_all(['section', 'ul', 'ol', 'div'], class_=ing_re):
            # First try: standard li list
            items = container.find_all('li', recursive=False) or container.find_all('li')
            if len(items) >= 2:
                result = [item.get_text(' ', strip=True) for item in items]
                result = [r for r in result if r and len(r) < 300]
                if len(result) >= 2:
                    return result

            # Second try: section-aware walk (heading + p/li groups)
            result = []
            for child in container.children:
                if not hasattr(child, 'name') or not child.name:
                    continue
                cls = ' '.join(child.get('class') or [])
                text = child.get_text(' ', strip=True)
                if not text:
                    continue
                # Section header
                if child.name in ('h2', 'h3', 'h4', 'h5') or heading_re.search(cls):
                    if len(text) < 100 and not skip_headings.match(text):
                        result.append(f'# {text}')
                    continue
                # Ingredient group: collect p or li children
                sub = child.find_all('li') or child.find_all('p')
                for item in sub:
                    t = item.get_text(' ', strip=True)
                    if t and len(t) < 300:
                        result.append(t)
            if len(result) >= 3:
                return result

        # Fallback: individual elements with ingredient class
        items = soup.find_all(class_=ing_re)
        candidates = []
        seen = set()
        for el in items:
            if el.name in ('section', 'div', 'ul', 'ol', 'article', 'main'):
                continue
            text = el.get_text(' ', strip=True)
            if text and len(text) < 300 and text not in seen:
                seen.add(text)
                candidates.append(text)
        if len(candidates) >= 2:
            return candidates
    except Exception:
        pass

    return []


_LEADING_NUM = re.compile(r'^\d+[\.\):]?\s+')


def _strip_step_num(text: str) -> str:
    return _LEADING_NUM.sub('', text).strip()


def extract_steps(soup: BeautifulSoup) -> list:
    # Strategy 1: Schema.org JSON-LD
    try:
        for tag in soup.find_all('script', type='application/ld+json'):
            try:
                data = _json.loads(tag.string or '')
            except Exception:
                continue
            if isinstance(data, dict) and '@graph' in data:
                candidates = data['@graph']
            elif isinstance(data, list):
                candidates = data
            else:
                candidates = [data]
            for obj in candidates:
                if not isinstance(obj, dict):
                    continue
                obj_type = obj.get('@type', '')
                types = obj_type if isinstance(obj_type, list) else [obj_type]
                if not any(t.lower() == 'recipe' for t in types if isinstance(t, str)):
                    continue
                raw = obj.get('recipeInstructions', [])
                if not raw:
                    continue
                if isinstance(raw, str):
                    lines = [l.strip() for l in raw.splitlines() if l.strip()]
                    if lines:
                        return lines
                    continue
                result = []
                for item in raw:
                    if isinstance(item, str):
                        val = item.strip()
                        if val:
                            result.append(val)
                    elif isinstance(item, dict):
                        item_type = item.get('@type', '')
                        if item_type == 'HowToSection':
                            section_name = item.get('name', '').strip()
                            if section_name:
                                result.append(f'# {section_name}')
                            for step in item.get('itemListElement', []):
                                if isinstance(step, dict):
                                    val = step.get('text', '').strip()
                                elif isinstance(step, str):
                                    val = step.strip()
                                else:
                                    val = ''
                                if val:
                                    result.append(val)
                        else:
                            val = item.get('text', '').strip() or item.get('name', '').strip()
                            if val:
                                result.append(val)
                if result:
                    return result
    except Exception:
        pass

    # Strategy 2: CSS class heuristics (section-aware)
    try:
        step_re = re.compile(r'direction|instruction|step|method', re.IGNORECASE)
        heading_re = re.compile(r'heading|header|title|step.?name|section', re.IGNORECASE)
        skip_headings = re.compile(
            r'^(directions?|instructions?|method|steps?|preparation|how to make)$',
            re.IGNORECASE
        )

        for container in soup.find_all(['section', 'div'], class_=step_re):
            result = []
            for child in container.children:
                if not hasattr(child, 'name') or not child.name:
                    continue
                cls = ' '.join(child.get('class') or [])
                text = child.get_text(' ', strip=True)
                if not text:
                    continue
                # Skip plain headings like "Directions"
                if child.name in ('h1', 'h2', 'h3', 'h4', 'h5'):
                    if not skip_headings.match(text):
                        result.append(f'# {text}')
                    continue
                # Section-grouped structure: ul/ol containing a label + a steps span
                if child.name in ('ul', 'ol'):
                    section_label = None
                    steps_group = None
                    for gc in child.children:
                        if not hasattr(gc, 'name') or not gc.name:
                            continue
                        gcls = ' '.join(gc.get('class') or [])
                        gctext = gc.get_text(' ', strip=True)
                        if (heading_re.search(gcls) or gc.name == 'li') and len(gctext) < 80:
                            # Likely a section label li/span
                            sub_ps = gc.find_all('p')
                            if not sub_ps and len(gctext) < 60:
                                section_label = gctext
                            continue
                        # A span/div containing the actual steps as p elements
                        sub_ps = gc.find_all('p')
                        if sub_ps:
                            steps_group = sub_ps
                    if section_label and steps_group:
                        result.append(f'# {section_label}')
                        for p in steps_group:
                            t = _strip_step_num(p.get_text(' ', strip=True))
                            if t and len(t) > 10:
                                result.append(t)
                        continue
                    # Plain ol/ul with li steps
                    lis = child.find_all('li')
                    for li in lis:
                        t = _strip_step_num(li.get_text(' ', strip=True))
                        if t and len(t) > 10:
                            result.append(t)
                    continue
                # A span/div that is itself a steps group (p children)
                sub_ps = child.find_all('p', recursive=False)
                for p in sub_ps:
                    t = _strip_step_num(p.get_text(' ', strip=True))
                    if t and len(t) > 10:
                        result.append(t)
            if len(result) >= 2:
                return result
    except Exception:
        pass

    # Strategy 3: heading heuristic
    try:
        _STEP_HEADINGS = re.compile(
            r'^\s*(directions?|instructions?|method|steps?|preparation)\s*$',
            re.IGNORECASE
        )
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            if not _STEP_HEADINGS.match(heading.get_text(strip=True)):
                continue
            steps = []
            level = int(heading.name[1])
            stop_tags = {'h1', 'h2', 'h3', 'h4', 'h5'}
            for sib in heading.find_next_siblings():
                if sib.name in stop_tags and int(sib.name[1]) <= level:
                    break
                if sib.name in ('ol', 'ul'):
                    for li in sib.find_all('li'):
                        text = _strip_step_num(li.get_text(' ', strip=True))
                        if text and len(text) > 10:
                            steps.append(text)
                elif sib.name == 'p':
                    text = _strip_step_num(sib.get_text(' ', strip=True))
                    if text and len(text) > 10:
                        steps.append(text)
                elif sib.name == 'div':
                    paras = sib.find_all('p', recursive=False)
                    if paras:
                        for p in paras:
                            text = _strip_step_num(p.get_text(' ', strip=True))
                            if text and len(text) > 10:
                                steps.append(text)
                    else:
                        text = _strip_step_num(sib.get_text(' ', strip=True))
                        if text and len(text) > 20:
                            steps.append(text)
                    break
            if len(steps) >= 2:
                return steps
    except Exception:
        pass

    return []


def _meta(soup, property_name):
    tag = soup.find('meta', attrs={'property': property_name})
    if tag and tag.get('content'):
        return tag['content'].strip() or None
    return None


def _meta_name(soup, name):
    tag = soup.find('meta', attrs={'name': name})
    if tag and tag.get('content'):
        return tag['content'].strip() or None
    return None


def _find_favicon(soup, base_url):
    for rel in ('apple-touch-icon', 'icon', 'shortcut icon'):
        tag = soup.find('link', rel=lambda r, _rel=rel: r and _rel in r)
        if tag and tag.get('href'):
            return urljoin(base_url, tag['href'])
    parsed = urlparse(base_url)
    return f'{parsed.scheme}://{parsed.netloc}/favicon.ico'


def _extract_text(soup):
    for tag in soup(['script', 'style', 'nav', 'header', 'footer',
                     'aside', 'form', 'noscript', 'iframe']):
        tag.decompose()
    container = soup.find('article') or soup.find('main') or soup.body
    if not container:
        return ''
    text = container.get_text(separator=' ', strip=True)
    text = re.sub(r'\s{2,}', ' ', text)
    return text[:50_000]
