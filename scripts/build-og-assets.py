#!/usr/bin/env python3
"""Build the Rivals Fantasy identity assets: assets/og-card.png (1200x630)
and assets/apple-touch-icon.png (180x180).

The card is set in the site's own register ("the comic cover x the
broadcast graphic") using the tokens from assets/css/main.css: dark ink
ground, halftone dots in the cover field, Anton condensed for the
headline, the wordmark with its red dot, role chips in the site's dark
tints, the stat strip composed as a hard-bordered panel with an offset
shadow, and the red broadcast band along the bottom. One burst, used the
way bursts are used on the site: for a status claim, not decoration.
Copy is timeless on purpose: a social card must stay true after any
single competition ends, so it describes the product, never a dated state.

Run: python3 scripts/build-og-assets.py   (needs Playwright + Chromium)
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_CARD = os.path.join(ROOT, "assets", "og-card.png")
OUT_ICON = os.path.join(ROOT, "assets", "apple-touch-icon.png")

FONT = '"Inter","SF Pro Display",system-ui,-apple-system,"Segoe UI",sans-serif'
DISPLAY = '"Anton","Arial Narrow","Inter",sans-serif'
MONO = 'ui-monospace,"SF Mono","Cascadia Mono",Menlo,Consolas,monospace'

CARD = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family:"Anton"; src:url("file://{ROOT}/assets/fonts/anton-latin-normal-400.woff2") format("woff2"); }}
@font-face {{ font-family:"Inter"; src:url("file://{ROOT}/assets/fonts/inter-latin-normal-var.woff2") format("woff2"); font-weight:100 900; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:{FONT}; background:#0b0d1c; color:#f5f3ec; }}
.card {{ width:1200px; height:630px; display:flex; flex-direction:column; position:relative; overflow:hidden;
  background:
    radial-gradient(rgba(232,50,43,0.20) 1.8px, transparent 1.9px) 0 0 / 24px 24px,
    radial-gradient(rgba(22,211,191,0.12) 1.8px, transparent 1.9px) 12px 12px / 24px 24px,
    linear-gradient(155deg, #151838 0%, #0b0d1c 62%); }}
.main {{ flex:1; padding:48px 64px 36px; display:flex; flex-direction:column; position:relative; }}
.top {{ display:flex; align-items:center; justify-content:space-between; }}
.wordmark {{ font-family:{DISPLAY}; font-size:32px; letter-spacing:0.03em; text-transform:uppercase; }}
.wordmark .dot {{ color:#e8322b; }}
.kicker {{ font-family:{MONO}; font-size:14px; letter-spacing:0.16em; color:#16d3bf; font-weight:600; }}
h1 {{ margin-top:36px; font-family:{DISPLAY}; font-size:88px; line-height:0.98; letter-spacing:0.005em;
  text-transform:uppercase; text-shadow:5px 5px 0 rgba(2,3,8,0.6); }}
h1 .accent {{ color:#e8322b; }}
.subrow {{ margin-top:20px; display:flex; align-items:center; gap:26px; }}
.sub {{ font-size:22px; line-height:1.45; color:#c9cce4; max-width:760px; }}
.burst {{ flex:none; background:#ffc72c; color:#191203; font-family:{MONO}; font-weight:700; font-size:13px;
  letter-spacing:0.1em; padding:15px 19px; transform:rotate(-3deg);
  clip-path:polygon(100% 50%,92.5% 61.8%,98.5% 73.2%,88.2% 78.5%,90.5% 91.2%,79.1% 90.5%,76.2% 100%,65.6% 93.9%,57.4% 100%,50% 91%,41.3% 99.1%,34.4% 92.6%,24.5% 97.6%,21.8% 87.3%,10.9% 87.8%,12.7% 76.5%,2.4% 71.4%,8.2% 61.2%,0% 50%,7.5% 38.2%,1.5% 26.8%,11.8% 21.5%,9.5% 8.8%,20.9% 9.5%,23.8% 0%,34.4% 6.1%,42.6% 0%,50% 9%,58.7% 0.9%,65.6% 7.4%,75.5% 2.4%,78.2% 12.7%,89.1% 12.2%,87.3% 23.5%,97.6% 28.6%,91.8% 38.8%); }}
.chips {{ margin-top:24px; display:flex; gap:10px; }}
.chip {{ font-family:{MONO}; font-size:13px; font-weight:600; letter-spacing:0.08em; padding:6px 12px; border-radius:5px; }}
.chip.van {{ background:#11382a; color:#63e6a4; }}
.chip.due {{ background:#401a12; color:#ffa08c; }}
.chip.str {{ background:#1d2c57; color:#9db9ff; }}
.stats {{ margin-top:auto; background:#161a38; border:2px solid #04050c; box-shadow:8px 8px 0 rgba(2,3,8,0.55);
  display:flex; padding:22px 28px 20px; }}
.stat {{ flex:1; }}
.stat + .stat {{ border-left:1px solid #2b3066; padding-left:28px; }}
.stat .n {{ font-family:{DISPLAY}; font-size:50px; line-height:1; }}
.stat .l {{ margin-top:9px; font-family:{MONO}; font-size:12px; letter-spacing:0.13em; color:#8f94bd; }}
.band {{ background:#e8322b; color:#fff; padding:22px 64px; display:flex; align-items:center; gap:14px;
  font-family:{MONO}; font-size:15px; font-weight:600; letter-spacing:0.14em; border-top:2px solid #04050c; }}
.band .sep {{ color:#ffc72c; }}
</style></head><body>
<div class="card" id="card">
  <div class="main">
    <div class="top">
      <div class="wordmark">Rivals<span class="dot">&middot;</span>Fantasy</div>
      <div class="kicker">FANTASY ESPORTS &middot; MARVEL RIVALS</div>
    </div>
    <h1>The pro season,<br><span class="accent">drafted by you.</span></h1>
    <div class="subrow">
      <p class="sub">Pick real pros by role, run a snake draft with your friends,
        and score every week from the actual match stats.</p>
      <div class="burst">FREE PRIVATE LEAGUES</div>
    </div>
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

ICON = """<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#12142e; }
.icon { width:180px; height:180px; background:#12142e; position:relative; }
.dot { position:absolute; left:44px; top:52px; width:16px; height:16px; border-radius:50%; background:#e8322b; }
.r1 { position:absolute; left:76px; top:57px; width:56px; height:15px; border-radius:7.5px; background:#f5f3ec; }
.r2 { position:absolute; left:44px; top:92px; width:92px; height:15px; border-radius:7.5px; background:#f5f3ec; opacity:0.72; }
.r3 { position:absolute; left:44px; top:122px; width:62px; height:15px; border-radius:7.5px; background:#16d3bf; opacity:0.85; }
</style></head><body><div class="icon" id="icon">
<div class="dot"></div><div class="r1"></div><div class="r2"></div><div class="r3"></div>
</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.set_content(CARD)
    pg.wait_for_timeout(400)
    pg.locator("#card").screenshot(path=OUT_CARD)
    pg2 = b.new_page(viewport={"width": 180, "height": 180}, device_scale_factor=1)
    pg2.set_content(ICON)
    pg2.locator("#icon").screenshot(path=OUT_ICON)
    b.close()
print("wrote", OUT_CARD, os.path.getsize(OUT_CARD), "bytes")
print("wrote", OUT_ICON, os.path.getsize(OUT_ICON), "bytes")
