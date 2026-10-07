#!/usr/bin/env python3
"""Pulls your pump.fun positions and keeps a markdown trade journal.

Closed swap trades are reconstructed from the on-chain buy/sell legs (not the API's own
aggregate, which hides rebuys) and diffed against the journal by contract address. Open
positions are always reported. Reflection, airdrop and transfer-in balance changes
(flagged by the API's own `hasTransfers`) are not folded into trade PnL: an optional REWARDS
section reads them from Helius and values them at the current price. Report only.

Settings come from the environment (the Claude Code plugin sets them from its own settings):
  PUMPFUN_WALLET           your wallet address (required)
  PUMPFUN_EXTRA_WALLETS    other wallets as label=address,label=address (optional)
  PUMPFUN_JOURNAL_DIR      folder for the journal files (default ~/pumpfun-journal)
  PUMPFUN_HELIUS_KEY       Helius API key, only for the REWARDS section (optional;
                           HELIUS_API_KEY works too)
  PUMPFUN_DEMO             1 makes --open-json print made-up positions (no wallet, no network)

Data sources (public, unauthenticated, an undocumented frontend API that can change):
  GET  frontend-api-v3.pump.fun/user-portfolio/<wallet>?filter=closed|open&page=N&pageSize=100
  POST swap-api.pump.fun/v1/coins/<mint>/trades/batch  {"userAddresses": ["<wallet>"]}

Default mode is a dry run: prints a report only. --write appends genuinely NEW closed
positions (mint not present anywhere in the journal folder's *.md) to the current month's
file, numeric fields filled in, thesis/outcome/mistake left as "not recorded" rather than
invented. Positions already in the journal but with mismatched numbers are reported as
MISMATCH and never auto-edited: the journal is append-only.

Usage:
  python3 scripts/pumpfun_journal.py                  # dry run, report only
  python3 scripts/pumpfun_journal.py --write          # also append new entries
  python3 scripts/pumpfun_journal.py --min-usd 2      # open-position dust floor (default $2)
  python3 scripts/pumpfun_journal.py --wallet <addr>  # scan only this address
  python3 scripts/pumpfun_journal.py --open-json      # open positions as JSON, read-only

Open positions: always reported (value >= --min-usd, every chain pump.fun tracks). With
--write, open-positions.md in the journal folder is regenerated as a snapshot (overwritten,
it is a view, not narrative).

Theses: if a position carries a pump.fun callout (your own posted thesis), that text fills
`thesis:` verbatim, labeled as coming from the callout. Otherwise "not recorded". Callout
updates (the thread you post under your own callout while holding) are fetched with --write
and saved verbatim to callouts/<SYMBOL>-<ca8>.md in the journal folder. Summarizing them is
judgment, not arithmetic, so the script never does it: blocks get a `thesis evolution:
pending` pointer and a summary written by you (or by Claude, see the skill) replaces it.

Extra wallets: every run then also scans them. Section headers carry a ` [label]` tag, e.g.
`=== OPEN [second]:`, and journal blocks a `wallet: label` line. Blocks without one belong to
the main wallet.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TRADES_DIR = Path(os.environ.get("PUMPFUN_JOURNAL_DIR") or "~/pumpfun-journal").expanduser()
DEFAULT_WALLET = os.environ.get("PUMPFUN_WALLET", "").strip()
MAIN = "main"  # label of the default wallet; its journal blocks carry no `wallet:` line
DEFAULT_SINCE_DAYS = 30
REQUEST_DELAY = 1.5  # seconds between legs requests, keeps well under the API's rate limit
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HELIUS_TXS = "https://api-mainnet.helius-rpc.com/v0/addresses/{wallet}/transactions"
HELIUS_RPC = "https://mainnet.helius-rpc.com/"
WSOL = "So11111111111111111111111111111111111111112"
REWARD_DUST_USD = 0.01  # below this a grouped reward is noise (incl. 0.0001 USDC address-poisoning spam)


def _request(req, tries=6):
    delay = 3.0
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if (e.code == 429 or e.code >= 500) and attempt < tries - 1:
                time.sleep(delay)
                delay *= 1.8
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            # a single slow read used to kill a 15-minute 30-day run; retry like a 429
            if attempt < tries - 1:
                time.sleep(delay)
                delay *= 1.8
                continue
            raise


def http_get(url):
    return _request(urllib.request.Request(url, headers={"User-Agent": UA}))


def http_post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"User-Agent": UA, "Content-Type": "application/json"},
    )
    return _request(req)


def fetch_closed_positions(wallet, since_iso):
    """Paginates newest-first (sortBy=RECENCY) and stops once positions fall before
    `since_iso`, so this never walks the wallet's full multi-year history.

    No dust floor here on purpose: a closed position's size is its cost basis
    (amountBoughtUsd), which does not shrink when the trade goes to -90%, so filtering
    closed positions by a dollar floor would risk dropping real losing trades, not noise.
    The dust floor only makes sense for OPEN positions (filtering negligible current
    holdings), which this script does not pull yet."""
    positions, page = [], 0
    while True:
        url = (f"https://frontend-api-v3.pump.fun/user-portfolio/{wallet}"
               f"?filter=closed&page={page}&pageSize=100&sortBy=RECENCY")
        data = http_get(url)
        batch = data.get("positions", [])
        if not batch:
            break
        stop = False
        for p in batch:
            if p.get("updatedAt", "") < since_iso:
                stop = True
                break
            positions.append(p)
        if stop:
            break
        page += 1
        if page * 100 >= data.get("summary", {}).get("positionCount", 0):
            break
        time.sleep(REQUEST_DELAY)
    return [p for p in positions if p.get("coin") and p["coin"].get("symbol")]


def fetch_legs(mint, wallet):
    url = f"https://swap-api.pump.fun/v1/coins/{mint}/trades/batch"
    data = http_post(url, {"userAddresses": [wallet]})
    legs = data.get(wallet, [])
    legs.sort(key=lambda t: t["timestamp"])
    return legs


def reconstruct(position, legs, wallet):
    coin = position["coin"]
    total_supply = coin.get("totalSupply")
    buys = [t for t in legs if t["type"] == "buy"]
    sells = [t for t in legs if t["type"] == "sell"]
    buy_usd = sum(float(t["amountUSD"]) for t in buys)
    sell_usd = sum(float(t["amountUSD"]) for t in sells)

    def mktcap(trade):
        if not total_supply:
            return None
        return float(trade["priceUSD"]) * total_supply

    entry_mc = mktcap(buys[0]) if buys else None
    exit_mc = mktcap(sells[-1]) if sells else None
    pnl_usd = sell_usd - buy_usd
    pnl_pct = (pnl_usd / buy_usd * 100) if buy_usd else None
    return {
        "symbol": coin["symbol"],
        "name": coin["name"],
        "mint": position["coinMint"],
        "buy_count": len(buys),
        "sell_count": len(sells),
        "buy_usd": buy_usd,
        "sell_usd": sell_usd,
        "entry_mc": entry_mc,
        "exit_mc": exit_mc,
        "pnl_usd": pnl_usd,
        "pnl_pct": pnl_pct,
        "closed_at": legs[-1]["timestamp"] if legs else position.get("updatedAt"),
        "has_transfers": position.get("hasTransfers", False),
        "api_pnl_usd": position.get("realizedPnlUsd"),
        "api_bought_usd": position.get("amountBoughtUsd"),
        "callout": position.get("callout") or None,
    }


def helius_key():
    """The Helius key from the environment, or None (the REWARDS section is then skipped)."""
    return os.environ.get("PUMPFUN_HELIUS_KEY") or os.environ.get("HELIUS_API_KEY") or None


def fetch_wallet_txs(wallet, since_ts, key):
    """Helius enhanced transactions, newest first, paginated with `before` until the
    window is covered. 100 txs is only ~2-3 days of this wallet's activity."""
    txs, before = [], None
    while True:
        url = HELIUS_TXS.format(wallet=wallet) + f"?api-key={key}&limit=100"
        if before:
            url += f"&before={before}"
        batch = http_get(url)
        if not batch:
            break
        txs.extend(t for t in batch if t.get("timestamp", 0) >= since_ts)
        if batch[-1].get("timestamp", 0) < since_ts:
            break
        before = batch[-1]["signature"]
        time.sleep(0.2)
    return txs


def reward_transfers(txs, wallet):
    """Incoming token transfers that are not swaps: reflections, holder rewards, airdrops.
    Only type=TRANSFER counts; SWAP and UNKNOWN (aggregator routes like DFLOW) are left to
    the swap-leg reconstruction above. Returns {mint: {"amount", "count", "senders", "last_ts"}}."""
    out = {}
    for t in txs:
        if t.get("type") != "TRANSFER":
            continue
        for tt in t.get("tokenTransfers", []):
            if tt.get("toUserAccount") != wallet or tt.get("fromUserAccount") == wallet:
                continue
            if tt.get("mint") == WSOL:
                continue
            g = out.setdefault(tt["mint"], {"amount": 0.0, "count": 0, "senders": set(), "last_ts": 0})
            g["amount"] += float(tt.get("tokenAmount") or 0)
            g["count"] += 1
            g["senders"].add(tt.get("fromUserAccount", "?"))
            g["last_ts"] = max(g["last_ts"], t["timestamp"])
    return out


def asset_prices(mints, key):
    """{mint: (symbol, current_usd_price_or_None)} via Helius DAS getAssetBatch. Current
    price only: DAS has no historical price, so reward values are 'as of now'."""
    res = {}
    mints = list(mints)
    for i in range(0, len(mints), 1000):
        body = {"jsonrpc": "2.0", "id": 1, "method": "getAssetBatch", "params": {"ids": mints[i:i + 1000]}}
        for a in http_post(HELIUS_RPC + f"?api-key={key}", body).get("result", []):
            if not a:
                continue
            ti = a.get("token_info") or {}
            sym = ti.get("symbol") or (a.get("content") or {}).get("metadata", {}).get("symbol") or a["id"][:6]
            res[a["id"]] = (sym, (ti.get("price_info") or {}).get("price_per_token"))
    return res


def report_rewards(wallet, since_ts, tag=""):
    key = helius_key()
    if not key:
        print(f"\n=== REWARDS{tag}: skipped, no Helius key set (PUMPFUN_HELIUS_KEY), it is optional ===")
        return
    try:
        txs = fetch_wallet_txs(wallet, since_ts, key)
        groups = reward_transfers(txs, wallet)
        prices = asset_prices(groups.keys(), key) if groups else {}
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"\n=== REWARDS{tag}: Helius request failed ({e}) ===")
        return
    rows, dust = [], 0
    for mint, g in groups.items():
        sym, price = prices.get(mint, (mint[:6], None))
        value = g["amount"] * price if price is not None else None
        if value is not None and value < REWARD_DUST_USD:
            dust += 1
            continue
        rows.append((value, sym, mint, g))
    rows.sort(key=lambda r: r[0] or 0, reverse=True)
    total = sum(r[0] for r in rows if r[0] is not None)
    print(f"\n=== REWARDS{tag}: {len(rows)} token(s) received as non-swap transfers "
          f"(reflections/holder rewards/airdrops), ~{fmt_usd(total)} at CURRENT price ===")
    for value, sym, mint, g in rows:
        senders = ", ".join(sorted(s[:8] for s in g["senders"]))
        last = datetime.fromtimestamp(g["last_ts"], timezone.utc).strftime("%Y-%m-%d")
        print(f"  {sym:<12} {g['amount']:,.6g} tokens in {g['count']} transfer(s), "
              f"~{fmt_usd(value)} now, last {last}, from {senders}  ca: {mint}")
    if dust:
        print(f"  (+{dust} token(s) under {fmt_usd(REWARD_DUST_USD)} ignored as dust/spam)")
    print("  (cost basis of these is $0; any sell PnL on them in the trades API is reward income, not trading skill)")


def _usd(s):
    return float(s.replace(",", ""))


def declared_cost(block_lines):
    """Total USD put into a journal block, or None. Precedence, never summed across kinds
    (a block with `buy 1`, `buy 2` AND `total in` would otherwise count everything twice):
      1. the LAST "total in $X" anywhere in the block, colon optional, so a later
         correction paragraph ("Total in $53.84, total out ...") overrides the original
      2. the sum of `buy N: $X` lines
      3. `size: $X`, or the "about $X" figure when size is written in SOL"""
    totals = [m.group(1) for bl in block_lines
              for m in re.finditer(r"total in:?\s*\$([\d,]+\.?\d*)", bl, re.I)]
    if totals:
        return _usd(totals[-1])
    buys = [re.match(r"^\s*buy\s*\d*\s*:\s*\$([\d,]+\.?\d*)", bl, re.I) for bl in block_lines]
    buys = [m for m in buys if m]
    if buys:
        return sum(_usd(m.group(1)) for m in buys)
    for bl in block_lines:
        m = re.match(r"^\s*size\s*:\s*(.*)", bl, re.I)
        if m:
            v = re.match(r"\$([\d,]+\.?\d*)", m.group(1)) or re.search(r"about \$([\d,]+\.?\d*)", m.group(1))
            if v:
                return _usd(v.group(1))
    return None


def extra_wallets():
    """{label: address} from PUMPFUN_EXTRA_WALLETS, `label=address,label=address`. Unset or
    malformed entries mean no extra wallet, never an error: the main wallet must keep working."""
    out = {}
    for part in os.environ.get("PUMPFUN_EXTRA_WALLETS", "").split(","):
        label, sep, addr = part.partition("=")
        label, addr = label.strip(), addr.strip()
        if sep and label and addr and label != MAIN:
            out[label] = addr
    return out


def require_wallet():
    if not DEFAULT_WALLET:
        sys.exit("PUMPFUN_WALLET is not set: put your wallet address in the plugin settings "
                 "or export PUMPFUN_WALLET=<address>.")


def parse_journal(text):
    """[(wallet_label, mint, declared_cost_or_None)] for every `ca: <mint>` block. A block
    without a `wallet:` line belongs to the main wallet, so journals written before the second
    wallet existed keep their meaning."""
    out, block, mint, wallet = [], [], None, MAIN
    for line in text.splitlines() + ["## end"]:
        if line.startswith("## "):
            if mint:
                out.append((wallet, mint, declared_cost(block)))
            block, mint, wallet = [], None, MAIN
            continue
        block.append(line)
        m = re.match(r"^ca:\s*(\S+)", line)
        if m:
            mint = m.group(1)
        w = re.match(r"^wallet:\s*(\S+)", line)
        if w:
            wallet = w.group(1)
    return out


def journal_mints():
    """{(wallet_label, mint): (filepath, declared_size_usd_or_None)} for every `ca: <mint>`
    block already logged, across all months. Keyed by wallet too, because the same token held
    in two wallets is two positions. declared_size is a heuristic (see declared_cost), compared
    against the reconstructed on-chain total rather than against the API's own aggregate
    (which would trivially agree with itself)."""
    found = {}
    if not TRADES_DIR.exists():
        return found
    for f in sorted(TRADES_DIR.glob("*.md")):
        text = f.read_text(encoding="utf-8", errors="replace")
        for wallet, mint, declared in parse_journal(text):
            found[(wallet, mint)] = (f, declared)
    return found


def fmt_usd(v):
    return f"${v:,.2f}" if v is not None else "?"


def fmt_mc(v):
    if v is None:
        return "unknown MC"
    if v >= 1_000_000:
        return f"${v/1_000_000:.2f}M MC"
    if v >= 1_000:
        return f"${v/1_000:.1f}k MC"
    return f"${v:.0f} MC"


def render_block(r, label=MAIN):
    date = r["closed_at"][:10]
    legs_note = f"{r['buy_count']} buy(s), {r['sell_count']} sell(s)"
    lines = [
        f"## {date} {r['symbol']} \"{r['name']}\" (Solana, pump.fun) [CLOSED, auto-populated: {legs_note}]",
        f"ca: {r['mint']}",
        *([f"wallet: {label}"] if label != MAIN else []),
        "source: pump.fun trades API, auto-populated by pumpfun_journal.py, not manually verified",
        "exit plan: none (auto-populated, not set at entry)",
        f"size: {fmt_usd(r['buy_usd'])}",
        f"entry: {fmt_mc(r['entry_mc'])}",
        f"exit: {fmt_mc(r['exit_mc'])}",
        f"pnl: {fmt_usd(r['pnl_usd'])}" + (f" ({r['pnl_pct']:+.1f}%)" if r["pnl_pct"] is not None else ""),
        thesis_line(r["callout"]),
        *([r["evolution"]] if r.get("evolution") else []),
        "outcome: not recorded",
        "mistake: not recorded",
    ]
    if r["has_transfers"]:
        lines.append("note: hasTransfers=true on this position, some balance change came from a "
                      "transfer/reflection/airdrop, not only these swaps. Numbers above cover the "
                      "swap legs only and may not be the full picture.")
    return "\n".join(lines)


CHAINS = {1399811149: "Solana", 4663: "Robinhood", 56: "BSC"}  # 4663 is Robinhood Chain; LONG is only the launchpad on it


def thesis_line(callout):
    """The wallet owner's own pump.fun callout text, verbatim, or "not recorded"."""
    if not callout or not callout.get("thesis"):
        return "thesis: not recorded"
    text = " ".join(callout["thesis"].split())
    when = (callout.get("calloutTimestamp") or "")[:10]
    mc = callout.get("calledOutAtMcap")
    return f"thesis (from the owner's pump.fun callout, {when}, called at {fmt_mc(mc)}): {text}"


CALLOUTS_DIR = TRADES_DIR / "callouts"


def callout_thread(callout, wallet):
    """The owner's own updates under a callout, oldest first. The portfolio payload embeds only the
    latest update, so the full thread comes from /callout/<id>/replies; replies from other
    wallets are dropped."""
    if not callout or not callout.get("updateCount"):
        return []
    data = http_get(f"https://frontend-api-v3.pump.fun/callout/{callout['calloutId']}/replies")
    own = [r for r in data.get("replies", []) if r.get("walletAddress") == wallet]
    return sorted(({"at": r["createdAt"], "text": r.get("content") or ""} for r in own),
                  key=lambda r: r["at"])


def thread_path(symbol, mint, label=MAIN):
    safe = re.sub(r"[^\w.-]", "_", symbol, flags=re.UNICODE) or "coin"
    suffix = "" if label == MAIN else "-" + re.sub(r"[^\w.-]", "_", label, flags=re.UNICODE)
    return CALLOUTS_DIR / f"{safe}-{mint[:8]}{suffix}.md"


def save_thread(symbol, mint, callout, thread, label=MAIN):
    """Raw layer: overwritten per coin whenever fetched, never summarized here."""
    CALLOUTS_DIR.mkdir(exist_ok=True)
    lines = [f"# {symbol} callout thread (raw, verbatim)", "",
             f"ca: {mint}",
             f"callout: {(callout.get('calloutTimestamp') or '')[:16]} at {fmt_mc(callout.get('calledOutAtMcap'))}",
             "", callout.get("thesis", "").strip(), ""]
    for r in thread:
        lines += [f"## {r['at'][:16].replace('T', ' ')} UTC", "", r["text"].strip(), ""]
    path = thread_path(symbol, mint, label)
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def evolution_pending(symbol, mint, thread, label=MAIN):
    if not thread:
        return None
    rel = thread_path(symbol, mint, label).relative_to(TRADES_DIR)
    return (f"thesis evolution: pending ({len(thread)} callout update(s), "
            f"{thread[0]['at'][:10]} to {thread[-1]['at'][:10]}, raw in {rel})")


def carried_evolutions(path):
    """{(wallet_label, ca): line} for written (not pending) `thesis evolution` lines in an
    existing snapshot. A block without a `wallet:` line is the main wallet's."""
    out = {}
    if not path.exists():
        return out
    for b in re.split(r"(?m)^(?=## )", path.read_text(encoding="utf-8")):
        ca = re.search(r"(?m)^ca:\s*(\S+)", b)
        ev = re.search(r"(?m)^(thesis evolution \(.*)$", b)
        wl = re.search(r"(?m)^wallet:\s*(\S+)", b)
        if ca and ev:
            out[(wl.group(1) if wl else MAIN, ca.group(1))] = ev.group(1)
    return out


def fetch_open_positions(wallet):
    positions, page = [], 0
    while True:
        url = (f"https://frontend-api-v3.pump.fun/user-portfolio/{wallet}"
               f"?filter=open&page={page}&pageSize=100&sortBy=RECENCY")
        data = http_get(url)
        batch = data.get("positions", [])
        positions.extend(batch)
        page += 1
        if not batch or page * 100 >= data.get("summary", {}).get("positionCount", 0):
            break
        time.sleep(REQUEST_DELAY)
    return positions


def open_rows(positions, min_usd):
    """Open positions worth at least min_usd, biggest first. The dust floor lives here and
    only here: 200 open positions are mostly spam airdrops worth cents."""
    rows = []
    for p in positions:
        value = p.get("valueUsd") or 0
        if value < min_usd:
            continue
        coin = p.get("coin") or {}
        rows.append({
            "symbol": coin.get("symbol") or p["coinMint"][:6],
            "name": coin.get("name") or "",
            "mint": p["coinMint"],
            "chain": CHAINS.get(p.get("chainId"), f"chain {p.get('chainId')}"),
            "value": value,
            "cost": p.get("costBasisUsd") or 0,
            # pump.fun's pnlUsd is realized + unrealized, so unrealized is derived here
            "upnl": value - (p.get("costBasisUsd") or 0),
            "total_pnl": p.get("pnlUsd"),
            "realized": p.get("realizedPnlUsd"),
            "mc": coin.get("marketCapUsd"),
            "has_transfers": p.get("hasTransfers", False),
            "spam": p.get("potentialSpam", False),
            "callout": p.get("callout") or None,
        })
    rows.sort(key=lambda r: r["value"], reverse=True)
    return rows


def render_open(rows, wallet, min_usd, dust_count, dust_value, label=MAIN):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    total = sum(r["value"] for r in rows)
    tail = [
        f"Wallet {wallet}. {len(rows)} position(s) worth >= {fmt_usd(min_usd)}, {fmt_usd(total)} total;",
        f"{dust_count} more under the floor ({fmt_usd(dust_value)}), mostly spam airdrops.",
    ]
    if label == MAIN:
        out = [
            "# Open positions (generated snapshot)",
            "",
            f"Regenerated by scripts/pumpfun-trades.py --write on {now}. Do not hand-edit: it is",
            "overwritten every run. Narrative belongs in the monthly journal when the position closes.",
            *tail,
        ]
    else:
        out = [f"# Second wallet {label} (reported separately from the main wallet)", "", *tail]
    for r in rows:
        pct = f" ({r['upnl'] / r['cost'] * 100:+.1f}%)" if r["cost"] else ""
        out += [
            "",
            f"## {r['symbol']} \"{r['name']}\" ({r['chain']}) [OPEN]",
            f"ca: {r['mint']}",
            *([f"wallet: {label}"] if label != MAIN else []),
            f"value: {fmt_usd(r['value'])} at {fmt_mc(r['mc'])}",
            f"cost basis: {fmt_usd(r['cost'])}",
            f"unrealized: {fmt_usd(r['upnl'])}{pct}",
            f"realized so far: {fmt_usd(r['realized'])} (total incl. realized: {fmt_usd(r['total_pnl'])})",
            thesis_line(r["callout"]),
        ]
        if r.get("evolution"):
            out.append(r["evolution"])
        if r["has_transfers"]:
            out.append("note: part of this bag arrived as transfers/rewards, not buys (hasTransfers=true)")
        if r["spam"]:
            out.append("note: pump.fun flags this token as potential spam")
    return "\n".join(out) + "\n"


BACKUP_DIR = TRADES_DIR / ".bak"
BACKUP_KEEP_DAYS = 14


def backup(path):
    """The journal folder may not be under version control, so there is no history to recover a
    bad write from. Before the first write of the day, keep a dated copy; prune days past
    BACKUP_KEEP_DAYS. The dot folder keeps the copies out of note apps' indexes."""
    if not path.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dest = BACKUP_DIR / f"{today}-{path.name}"
    if not dest.exists():
        dest.write_bytes(path.read_bytes())
    days = sorted({f.name[:10] for f in BACKUP_DIR.glob("????-??-??-*")})
    for old in days[:-BACKUP_KEEP_DAYS]:
        for f in BACKUP_DIR.glob(f"{old}-*"):
            f.unlink()


def current_month_file():
    name = datetime.now(timezone.utc).strftime("%Y-%m") + ".md"
    return TRADES_DIR / name


def label_for(addr, extras):
    if addr == DEFAULT_WALLET:
        return MAIN
    for label, a in extras.items():
        if a == addr:
            return label
    return addr[:8]


def scan_wallet(wallet, label, args, known, since_iso):
    """Print the NEW / MISMATCH / SKIPPED / REWARDS / OPEN report for one wallet and return what
    --write needs. Section headers carry a ` [label]` tag for every wallet but the main one, so
    report parsers that filter on `^=== (NEW|...)` keep matching."""
    tag = "" if label == MAIN else f" [{label}]"
    print(f"Fetching closed positions for {label} wallet {wallet[:4]}...{wallet[-4:]} since {since_iso[:10]} "
          f"(no dust floor, closed positions are never filtered by size)...")
    positions = fetch_closed_positions(wallet, since_iso)
    print(f"{len(positions)} closed positions in that window.\n")

    new, mismatched, skipped = [], [], []
    for i, p in enumerate(positions, 1):
        mint = p["coinMint"]
        if i % 25 == 0:
            print(f"  ...{i}/{len(positions)} ledgers fetched", file=sys.stderr, flush=True)
        time.sleep(REQUEST_DELAY)
        try:
            legs = fetch_legs(mint, wallet)
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
            skipped.append((p["coin"]["symbol"], mint, e))
            continue
        if not legs:
            continue  # no swap legs at all, e.g. fully transfer-based position
        r = reconstruct(p, legs, wallet)
        if r["closed_at"] < since_iso:
            # updatedAt moves when a reward lands, so an old trade can page in; judge by its last leg
            continue
        if (label, mint) in known:
            path, declared_size = known[(label, mint)]
            reconstructed = r["buy_usd"]
            if declared_size is not None and abs(reconstructed - declared_size) > max(1.0, 0.15 * declared_size):
                mismatched.append((r, path, declared_size))
        else:
            new.append(r)

    print(f"=== NEW{tag}: {len(new)} closed position(s) not in the journal ===")
    for r in new:
        print(f"  {r['closed_at'][:10]}  {r['symbol']:<12} size={fmt_usd(r['buy_usd'])}  "
              f"pnl={fmt_usd(r['pnl_usd'])}"
              + (f" ({r['pnl_pct']:+.1f}%)" if r["pnl_pct"] is not None else "")
              + ("  [hasTransfers]" if r["has_transfers"] else ""))

    print(f"\n=== MISMATCH{tag}: {len(mismatched)} already-logged position(s) whose reconstructed "
          f"cost disagrees with what's written in the journal (added to after logging, or "
          f"logged partially) ===")
    for r, path, declared in mismatched:
        print(f"  {r['symbol']:<12} journal: {path.name}  declared size={fmt_usd(declared)}  "
              f"reconstructed from chain={fmt_usd(r['buy_usd'])}")
    print("  (not auto-edited: journal is append-only, review and add a correction by hand)")

    if skipped:
        print(f"\n=== SKIPPED{tag}: {len(skipped)} position(s) whose trade ledger could not be fetched "
              f"after retries, re-run to pick them up ===")
        for sym, mint, e in skipped:
            print(f"  {sym:<12} {mint}  ({e})")

    report_rewards(wallet, int(datetime.fromisoformat(since_iso).timestamp()), tag)

    open_pos = fetch_open_positions(wallet)
    rows = open_rows(open_pos, args.min_usd)
    dust = [p for p in open_pos if (p.get("valueUsd") or 0) < args.min_usd]
    dust_value = sum(p.get("valueUsd") or 0 for p in dust)
    print(f"\n=== OPEN{tag}: {len(rows)} position(s) worth >= {fmt_usd(args.min_usd)}, "
          f"{fmt_usd(sum(r['value'] for r in rows))} value, "
          f"{fmt_usd(sum(r['upnl'] or 0 for r in rows))} unrealized ===")
    for r in rows:
        print(f"  {r['symbol']:<12} {r['chain']:<8} value={fmt_usd(r['value'])}  cost={fmt_usd(r['cost'])}  "
              f"upnl={fmt_usd(r['upnl'])}" + ("  [callout]" if r["callout"] else "")
              + ("  [transfers]" if r["has_transfers"] else ""))
    print(f"  (+{len(dust)} under the floor, {fmt_usd(dust_value)} total)")
    return {"label": label, "wallet": wallet, "new": new, "rows": rows,
            "dust_count": len(dust), "dust_value": dust_value}


DEMO_ROWS = [  # made-up positions for PUMPFUN_DEMO=1: screenshots and a first look, no wallet, no network
    ("MOONCAT", "Solana", "main-wallet", 412.80, 250.00),
    ("PIXELDOG", "Solana", "main-wallet", 96.40, 160.00),
    ("BLOBFISH", "Solana", "side-wallet", 58.20, 20.00),
    ("GLITCH", "Robinhood", "main-wallet", 33.10, 41.50),
    ("ZENFROG", "Solana", "side-wallet", 12.70, 12.20),
]


def demo_json():
    rows = [{"symbol": sym, "mint": f"demo{i}", "chain": chain, "value": value, "cost": cost,
             "upnl": value - cost, "mc": None, "wallet": wallet}
            for i, (sym, chain, wallet, value, cost) in enumerate(DEMO_ROWS)]
    print(json.dumps({"rows": rows, "failed": []}))


def open_json(min_usd):
    """Open positions of the main wallet and every wallet in wallets.json, all chains, as JSON
    for the positions-pane mod. Read-only: no journal, no snapshot, no wallet address in the
    output. Wallets are fetched in parallel; one failing wallet is listed in `failed`, the rest
    still come back."""
    from concurrent.futures import ThreadPoolExecutor

    wallets = [(MAIN, DEFAULT_WALLET)] + list(extra_wallets().items())
    keys = ("symbol", "mint", "chain", "value", "cost", "upnl", "mc")

    def one(item):
        label, wallet = item
        try:
            rows = open_rows(fetch_open_positions(wallet), min_usd)
        except Exception:
            return label, None
        return label, [{**{k: r[k] for k in keys}, "wallet": label} for r in rows]

    with ThreadPoolExecutor(max_workers=len(wallets)) as pool:
        done = list(pool.map(one, wallets))
    rows = sorted((r for _, got in done if got for r in got), key=lambda r: r["value"], reverse=True)
    print(json.dumps({"rows": rows, "failed": [label for label, got in done if got is None]}))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wallet", default=None,
                    help="scan only this address (default: the main wallet plus every wallet in PUMPFUN_EXTRA_WALLETS)")
    ap.add_argument("--since-days", type=int, default=DEFAULT_SINCE_DAYS,
                     help=f"only consider positions closed in the last N days (default {DEFAULT_SINCE_DAYS})")
    ap.add_argument("--write", action="store_true",
                    help="append new closed positions to the journal and regenerate open-positions.md")
    ap.add_argument("--min-usd", type=float, default=2.0,
                    help="dust floor for OPEN positions only (default $2)")
    ap.add_argument("--open-json", action="store_true",
                    help="print open positions of all tracked wallets and chains as JSON and exit (read-only, used by the positions pane)")
    args = ap.parse_args()

    if args.open_json and os.environ.get("PUMPFUN_DEMO") == "1":
        demo_json()
        return
    require_wallet()

    if args.open_json:
        open_json(args.min_usd)
        return

    extras = extra_wallets()
    if args.wallet:
        wallets = [(label_for(args.wallet, extras), args.wallet)]
    else:
        wallets = [(MAIN, DEFAULT_WALLET)] + list(extras.items())
    since_iso = (datetime.now(timezone.utc) - timedelta(days=args.since_days)).isoformat()
    known = journal_mints()

    results = []
    for label, wallet in wallets:
        try:
            results.append(scan_wallet(wallet, label, args, known, since_iso))
        except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError, OSError) as e:
            if label == MAIN or args.wallet:
                raise  # the main wallet failing is a real failure, an extra wallet must not take it down
            print(f"\n=== SKIPPED [{label}]: wallet scan failed ({e}) ===")
        print()

    if not args.write:
        print("Dry run only. Re-run with --write to append the NEW positions above "
              "and regenerate open-positions.md.")
        return

    TRADES_DIR.mkdir(parents=True, exist_ok=True)
    snap = TRADES_DIR / "open-positions.md"
    backup(snap)
    backup(current_month_file())
    carried = carried_evolutions(snap)
    texts = []
    for res in results:
        label, wallet = res["label"], res["wallet"]
        for r in res["rows"] + res["new"]:
            thread = []
            if r.get("callout") and r["callout"].get("updateCount"):
                time.sleep(0.5)
                try:
                    thread = callout_thread(r["callout"], wallet)
                    save_thread(r["symbol"], r["mint"], r["callout"], thread, label)
                except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError) as e:
                    print(f"  callout thread for {r['symbol']} not fetched ({e})", file=sys.stderr)
            ev = carried.get((label, r["mint"]))
            if ev:
                # a written summary goes stale when the thread keeps growing while the bag is open
                ev = re.sub(r" \[STALE: .*?\]$", "", ev)
                n = re.search(r"summary of (\d+) callout", ev)
                if n and len(thread) > int(n.group(1)):
                    ev += f" [STALE: {len(thread) - int(n.group(1))} newer update(s), re-summarize]"
            r["evolution"] = ev or evolution_pending(r["symbol"], r["mint"], thread, label)
        texts.append(render_open(res["rows"], wallet, args.min_usd, res["dust_count"], res["dust_value"], label))
    if args.wallet:
        # One wallet alone would overwrite the other wallets' sections of the snapshot.
        print("Open snapshot left as is: --wallet scans a single address, run without it to regenerate.")
    else:
        snap.write_text("\n".join(texts), encoding="utf-8")
        print(f"Regenerated {snap} ({sum(len(res['rows']) for res in results)} open position(s)).")

    total_new = sum(len(res["new"]) for res in results)
    if not total_new:
        print("\nNothing new to write.")
        return

    out = current_month_file()
    if not out.exists():
        TRADES_DIR.mkdir(parents=True, exist_ok=True)
        out.write_text(f"# Trade journal {out.stem}\n\nAppend only, newest at the bottom. One block per "
                       f"position, written when you close it.\n", encoding="utf-8")

    with out.open("a", encoding="utf-8") as f:
        for res in results:
            for r in res["new"]:
                f.write("\n\n" + render_block(r, res["label"]) + "\n")
    print(f"\nAppended {total_new} new position(s) to {out}.")


if __name__ == "__main__":
    main()
