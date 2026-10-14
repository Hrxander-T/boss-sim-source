#!/usr/bin/env python3
"""
Scrape boss lineups from the Pokemon Revolution Online wiki (MediaWiki).

Usage:
    python pro_boss_scraper.py              # every boss on /Bosses
    python pro_boss_scraper.py BattleBot    # only bosses whose name contains this
Output: bosses.json (nested) and bosses.csv (one row per move)

Install: pip install requests beautifulsoup4
"""
import copy
import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from urllib import robotparser

BASE = "https://wiki.pokemonrevolution.net"
HEADERS = {"User-Agent": "pro-boss-scraper/1.0 (personal, low-rate)"}
DELAY = 1.5  # seconds between real requests
CACHE = Path("cache")
CACHE.mkdir(exist_ok=True)

_robots = robotparser.RobotFileParser()
try:
    _robots.parse(requests.get(f"{BASE}/robots.txt", headers=HEADERS, timeout=10).text.splitlines())
except Exception:
    _robots = None


def clean(el):
    return " ".join(el.get_text(" ", strip=True).split()) if el else ""


def get_soup(url):
    """Fetch with on-disk cache so re-runs don't hit the site again."""
    f = CACHE / (re.sub(r"\W+", "_", url) + ".html")
    if f.exists():
        html = f.read_text(encoding="utf-8")
    else:
        if _robots and not _robots.can_fetch(HEADERS["User-Agent"], url):
            raise PermissionError(f"robots.txt disallows {url}")
        time.sleep(DELAY)
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        html = r.text
        f.write_text(html, encoding="utf-8")
    return BeautifulSoup(html, "html.parser")


# ---------- boss index ----------
def list_bosses():
    soup = get_soup(f"{BASE}/Bosses")
    content = soup.select_one("#mw-content-text") or soup
    bosses = []
    for table in content.find_all("table"):
        first = table.find("tr")
        if not first or clean(first.find(["th", "td"])) != "Boss":
            continue
        heading = clean(table.find_previous(["h2", "h3"])).replace("[edit]", "").strip()
        for row in table.find_all("tr")[1:]:
            tds = row.find_all("td")
            if len(tds) < 4:
                continue
            a = tds[0].find("a", href=True)
            if not a or "redlink=1" in a["href"]:  # page doesn't exist
                continue
            bosses.append({
                "name": clean(tds[0]),
                "url": urljoin(BASE, a["href"]),
                "category": heading,  # Quest Bosses / Repeatable Bosses / Discontinued Bosses
                "region": clean(tds[1]),
                "location": clean(tds[2]),
                "cooldown": clean(tds[3]),
            })
    return bosses


# ---------- boss page ----------
def direct_cells(tr):
    return [clean(c) for c in tr.find_all(["th", "td"], recursive=False)]


def header_of(table):
    tr = table.find("tr")
    return direct_cells(tr) if tr else []


def is_moves_table(t):
    h = header_of(t)
    return bool(h) and h[0] == "Move" and "Base Power" in h


def is_stats_table(t):
    return {"Nature", "Ability", "Item"} <= set(header_of(t))


def parse_pokemon(box, moves_table):
    # name: wrapper's own text with all nested tables removed (keeps "Mega " prefix)
    clone = copy.copy(box)
    for t in clone.find_all("table"):
        t.decompose()
    name = clean(clone)
    if not name:
        a = box.find("a", href=lambda h: h and "/File:" not in h and "redlink" not in h)
        name = clean(a)

    stats = next(t for t in box.find_all("table") if is_stats_table(t))
    rows = stats.find_all("tr")
    vals = direct_cells(rows[1]) if len(rows) > 1 else []
    vals += [""] * (3 - len(vals))

    moves = []
    for tr in moves_table.find_all("tr")[1:]:
        c = direct_cells(tr)
        if len(c) < 5 or not c[0] or re.fullmatch(r"[\[\]\s]*", c[0]):
            continue  # skip empty/placeholder rows like [[]]
        moves.append({"move": c[0], "type": c[1], "category": c[2],
                      "power": c[3], "accuracy": c[4]})
    return {"pokemon": name, "nature": vals[0], "ability": vals[1], "item": vals[2], "moves": moves}


def parse_boss(url):
    soup = get_soup(url)
    content = soup.select_one("#mw-content-text") or soup
    teams = {}
    for mt in content.find_all("table"):
        if not is_moves_table(mt):
            continue
        # nearest ancestor table holding exactly this Pokemon's stats + moves
        box = None
        for anc in mt.find_parents("table"):
            inner = anc.find_all("table")
            if any(is_stats_table(t) for t in inner) and sum(is_moves_table(t) for t in inner) == 1:
                box = anc
                break
        if box is None:
            continue
        label = clean(box.find_previous(["h2", "h3", "h4"])).replace("[edit]", "").strip() or "Lineup"
        teams.setdefault(label, []).append(parse_pokemon(box, mt))
    m = re.search(r"difficulty of (\w+)", content.get_text(" "))
    return {"difficulty_note": m.group(1) if m else "",
            "lineups_found": list(teams),
            "teams": pick_best(teams)}


RANK = {"hard": 3, "medium": 2, "easy": 1}


def pick_best(teams):
    """Keep only the Hard lineup. If there's just one lineup, keep it.
    If Hard is missing, fall back to the highest difficulty that exists."""
    if len(teams) <= 1:
        return teams
    ranked = {}
    for label in teams:
        for word, r in RANK.items():
            if word in label.lower():
                ranked[label] = r
    if not ranked:
        return teams  # labels carry no difficulty info; keep everything
    best = max(ranked, key=ranked.get)
    return {best: teams[best]}


# ---------- main ----------
def main():
    filters = [a.lower() for a in sys.argv[1:]]
    bosses = list_bosses()
    if filters:
        bosses = [b for b in bosses if any(f in b["name"].lower() for f in filters)]
    print(f"{len(bosses)} boss page(s) to scrape")

    for i, b in enumerate(bosses, 1):
        try:
            b.update(parse_boss(b["url"]))
            n = sum(len(t) for t in b["teams"].values())
            print(f"[{i}/{len(bosses)}] {b['name']}: {n} Pokemon")
        except Exception as e:
            b["error"] = str(e)
            print(f"[{i}/{len(bosses)}] {b['name']}: FAILED ({e})")

    Path("bosses.json").write_text(json.dumps(bosses, indent=2, ensure_ascii=False), encoding="utf-8")

    cols = ["boss", "category", "team", "pokemon", "nature", "ability", "item",
            "move", "type", "move_category", "power", "accuracy"]
    with open("bosses.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for b in bosses:
            for team, mons in b.get("teams", {}).items():
                for p in mons:
                    base = [b["name"], b["category"], team, p["pokemon"], p["nature"], p["ability"], p["item"]]
                    for m in p["moves"] or [{}]:
                        w.writerow(base + [m.get("move", ""), m.get("type", ""), m.get("category", ""),
                                           m.get("power", ""), m.get("accuracy", "")])
    print("Wrote bosses.json and bosses.csv")


if __name__ == "__main__":
    main()
