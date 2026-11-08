"""Backfill public.psx_price_history from PSX's daily market-summary files.

The live board (the market-data service) is captured only from the day it was
first ingested, and PSX withdrew its /timeseries feed on 2026-09-24, so earlier
closes have to come from the exchange's per-day summary download:

    https://dps.psx.com.pk/download/mkt_summary/YYYY-MM-DD.Z
    (a zip of pipe-delimited rows: date|symbol|sector|name|open|high|low|close|volume|ldcp)

Usage:
    python -I scripts/psx/backfill-closes.py --from 2026-03-01 --to 2026-11-06 \
        --symbols FFC,MCB,MIIETF --out backfill.sql

Get the symbols from the database (every symbol anyone has traded):
    select string_agg(distinct upper(trim(symbol)), ',') from public.stock_transactions;

The output is one INSERT ... ON CONFLICT DO NOTHING statement (existing closes are
kept). Review it, run it in the SQL editor, then mark users for a snapshot recompute:
    insert into snapshot_private.dirty (user_id, from_date, marked_at)
    select distinct user_id, date '2000-01-01', now() from public.stock_transactions
    on conflict (user_id) do update set from_date = least(snapshot_private.dirty.from_date, excluded.from_date), marked_at = now();
    select snapshot_private.request_run();

Single-day prints that jump more than --spike (default 11%) and revert to within a tenth of that the next
day are dropped as exchange glitches; the previous close then carries over.
Holidays have no file and are skipped. Downloads are cached in --cache.
"""
import argparse, datetime as dt, os, sys, time, urllib.error, urllib.request, zipfile

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def fetch(day, cache):
    path = os.path.join(cache, f"{day}.Z")
    if not os.path.exists(path):
        req = urllib.request.Request(f"https://dps.psx.com.pk/download/mkt_summary/{day}.Z", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
        except urllib.error.HTTPError:
            return None  # holiday: no file
        time.sleep(0.6)  # be gentle with the exchange
        if data[:2] != b"PK":
            return None
        with open(path, "wb") as f:
            f.write(data)
    with zipfile.ZipFile(path) as z:
        return z.read(z.namelist()[0]).decode("latin-1")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--symbols", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".psx-cache"))
    ap.add_argument("--spike", type=float, default=0.11)
    a = ap.parse_args()
    syms = {s.strip().upper() for s in a.symbols.split(",") if s.strip()}
    os.makedirs(a.cache, exist_ok=True)

    closes = {s: {} for s in syms}
    day, end = dt.date.fromisoformat(a.start), dt.date.fromisoformat(a.end)
    days = []
    while day <= end:
        if day.weekday() < 5:
            text = fetch(day, a.cache)
            if text:
                days.append(str(day))
                for line in text.splitlines():
                    p = line.split("|")
                    if len(p) < 10 or p[1].strip().upper() not in syms:
                        continue
                    try:
                        c = float(p[7])
                    except ValueError:
                        continue
                    if c > 0:
                        closes[p[1].strip().upper()][str(day)] = c
        day += dt.timedelta(days=1)

    dropped = []
    for s, by in closes.items():
        ds = sorted(by)
        for i in range(1, len(ds) - 1):
            prev, cur, nxt = by[ds[i - 1]], by[ds[i]], by[ds[i + 1]]
            if abs(cur / prev - 1) > a.spike and abs(nxt / prev - 1) < a.spike / 10:
                dropped.append(f"{s} {ds[i]} {cur} (between {prev} and {nxt})")
        for d in [x.split()[1] for x in dropped if x.startswith(s + " ")]:
            by.pop(d, None)

    rows = [(s, d, c) for s in sorted(closes) for d, c in sorted(closes[s].items())]
    if not rows:
        sys.exit("no closes found")
    values = ",\n".join(f"('{s}', '{d}', {c})" for s, d, c in rows)
    with open(a.out, "w") as f:
        f.write("insert into public.psx_price_history (symbol, price_date, close) values\n"
                + values + "\non conflict (symbol, price_date) do nothing;\n")
    missing = sorted(s for s in syms if not closes[s])
    print(f"{len(days)} trading days, {len(rows)} closes, {len(syms) - len(missing)} symbols -> {a.out}")
    if missing:
        print("not found in any summary:", ", ".join(missing))
    for d in dropped:
        print("dropped spike:", d)


if __name__ == "__main__":
    main()
