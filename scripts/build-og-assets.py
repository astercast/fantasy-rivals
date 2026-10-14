#!/usr/bin/env python3
"""Build the Rivals Fantasy identity assets: assets/og-card.png (1200x630)
and assets/apple-touch-icon.png (180x180).

The card is identity work, not a template: it is set in the site's own
register ("the stat sheet, broadcast desk") using the tokens from
assets/css/main.css. Paper ground, ink type, the wordmark with its teal
dot, a ruled stat strip with the pool's real counts, role chips in the
site's own tints, and a dark broadcast band along the bottom. Copy is
timeless on purpose: a social card must stay true after any single
competition ends, so it describes the product, never a dated state.

Run: python3 scripts/build-og-assets.py   (needs Playwright + Chromium)
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_CARD = os.path.join(ROOT, "assets", "og-card.png")
OUT_ICON = os.path.join(ROOT, "assets", "apple-touch-icon.png")

FONT = '"Inter","SF Pro Display",system-ui,-apple-system,"Segoe UI",sans-serif'
MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Menlo,Consolas,monospace'

CARD = f"""<!doctype html><html><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:{FONT}; background:#fafaf7; color:#10151a; }}
.card {{ width:1200px; height:630px; display:flex; flex-direction:column; background:#fafaf7; }}
.main {{ flex:1; padding:46px 64px 34px; display:flex; flex-direction:column; }}
.top {{ display:flex; align-items:center; justify-content:space-between; }}
.wordmark {{ font-size:30px; font-weight:750; letter-spacing:-0.02em; }}
.wordmark .dot {{ color:#00a884; }}
.kicker {{ font-family:{MONO}; font-size:14px; letter-spacing:0.16em; color:#00705c; font-weight:600; }}
h1 {{ margin-top:32px; font-size:72px; line-height:1.04; letter-spacing:-0.025em; font-weight:750; }}
h1 .accent {{ color:#00705c; }}
.sub {{ margin-top:18px; font-size:23px; line-height:1.45; color:#3c454e; max-width:900px; }}
.chips {{ margin-top:20px; display:flex; gap:10px; }}
.chip {{ font-family:{MONO}; font-size:13px; font-weight:600; letter-spacing:0.08em; padding:6px 12px; border-radius:5px; }}
.chip.van {{ background:#e8f0ec; color:#14532d; }}
.chip.due {{ background:#f7ecea; color:#7c2d24; }}
.chip.str {{ background:#e9edf7; color:#2c3e70; }}
.stats {{ margin-top:auto; border-top:1px solid #c9c6bb; border-bottom:1px solid #c9c6bb;
  display:flex; padding:22px 0 20px; }}
.stat {{ flex:1; }}
.stat + .stat {{ border-left:1px solid #e2e0d8; padding-left:28px; }}
.stat .n {{ font-family:{MONO}; font-size:46px; font-weight:600; line-height:1; }}
.stat .l {{ margin-top:9px; font-family:{MONO}; font-size:12px; letter-spacing:0.13em; color:#78828c; }}
.band {{ background:#0b0e11; color:#eef1ee; padding:24px 64px; display:flex; align-items:center; gap:14px;
  font-family:{MONO}; font-size:15px; letter-spacing:0.14em; }}
.band .sep {{ color:#00a884; }}
</style></head><body>
<div class="card" id="card">
  <div class="main">
    <div class="top">
      <div class="wordmark">Rivals<span class="dot">&middot;</span>Fantasy</div>
      <div class="kicker">FANTASY ESPORTS &middot; MARVEL RIVALS</div>
    </div>
    <h1>The pro season,<br><span class="accent">drafted by you.</span></h1>
    <p class="sub">Pick real pros by role, run a snake draft with your friends,
      and score every week from the actual match stats.</p>
    <div class="chips">
      <span class="chip van">VANGUARD</span><span class="chip due">DUELIST</span><span class="chip str">STRATEGIST</span>
    </div>
    <div class="stats">
      <div class="stat"><div class="n">98</div><div class="l">PROS IN THE POOL</div></div>
      <div class="stat"><div class="n">52</div><div class="l">PRO TEAMS TRACKED</div></div>
      <div class="stat"><div class="n">16</div><div class="l">FULL ROSTERS VERIFIED</div></div>
      <div class="stat"><div class="n">9</div><div class="l">DRAFT ROUNDS</div></div>
    </div>
  </div>
  <div class="band"><span>SNAKE DRAFT</span><span class="sep">&middot;</span><span>ROLE LINEUPS</span><span class="sep">&middot;</span><span>WEEKLY HEAD-TO-HEAD</span><span class="sep">&middot;</span><span>REAL MATCH STATS</span></div>
</div>
</body></html>"""

ICON = f"""<!doctype html><html><head><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#10151a; }}
.icon {{ width:180px; height:180px; background:#10151a; position:relative; }}
.dot {{ position:absolute; left:44px; top:52px; width:16px; height:16px; border-radius:50%; background:#00a884; }}
.r1 {{ position:absolute; left:76px; top:57px; width:56px; height:15px; border-radius:7.5px; background:#fafaf7; }}
.r2 {{ position:absolute; left:44px; top:92px; width:92px; height:15px; border-radius:7.5px; background:#fafaf7; opacity:0.72; }}
.r3 {{ position:absolute; left:44px; top:122px; width:62px; height:15px; border-radius:7.5px; background:#fafaf7; opacity:0.45; }}
</style></head><body><div class="icon" id="icon">
<div class="dot"></div><div class="r1"></div><div class="r2"></div><div class="r3"></div>
</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.set_content(CARD)
    pg.locator("#card").screenshot(path=OUT_CARD)
    pg2 = b.new_page(viewport={"width": 180, "height": 180}, device_scale_factor=1)
    pg2.set_content(ICON)
    pg2.locator("#icon").screenshot(path=OUT_ICON)
    b.close()
print("wrote", OUT_CARD, os.path.getsize(OUT_CARD), "bytes")
print("wrote", OUT_ICON, os.path.getsize(OUT_ICON), "bytes")
