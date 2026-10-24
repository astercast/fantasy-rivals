#!/usr/bin/env python3
"""Build the Rivals Fantasy identity assets: assets/og-card.png (1200x630)
and assets/apple-touch-icon.png (180x180).

V3 system: deep ink-navy ground, the official current-season key art at
full bleed with a legibility scrim, Archivo condensed for the headline
and wordmark, one red band along the bottom, stats in one colour. No
halftone, no burst, no chips, no Anton, no Inter. Copy is timeless on
purpose: a social card must stay true after any single competition
ends, so it describes the product, never a dated state. Presented copy
holds the dash law (no U+2014 anywhere in the card).

Run: python3 scripts/build-og-assets.py   (needs Playwright + Chromium)

TY7 (rotation 142): the site references assets/og-card.jpg, so the
build also writes the deployed JPEG from the PNG master — quality
60, progressive, 4:2:0 — a sane weight for a share card (the
unoptimized conversion that first shipped ran 122,281 bytes; the
rotation-142 recompress of it landed at 89,034). The PNG stays the
master; the JPEG is what the meta tags point at.
"""
import base64
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_CARD = os.path.join(ROOT, "assets", "og-card.png")
OUT_CARD_JPG = os.path.join(ROOT, "assets", "og-card.jpg")
OUT_ICON = os.path.join(ROOT, "assets", "apple-touch-icon.png")
# The art rides as a data URI: a set_content page has a null origin and
# Chromium refuses file:// subresources from it.
with open(os.path.join(ROOT, "assets", "img", "hero-key-art.jpg"), "rb") as fh:
    ART = "data:image/jpeg;base64," + base64.b64encode(fh.read()).decode()
FONT = '"Archivo","Archivo Fallback",system-ui,-apple-system,"Segoe UI",sans-serif'

CARD = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family:"Archivo"; src:url("file://{ROOT}/assets/fonts/archivo-latin-normal-var.woff2") format("woff2-variations"); font-weight:100 900; font-stretch:62% 125%; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:{FONT}; background:#0a1224; color:#f2f5fa; }}
.card {{ width:1200px; height:630px; display:flex; flex-direction:column; position:relative; overflow:hidden; background:#0a1224; }}
.art {{ position:absolute; inset:0 0 54px 0; width:100%; height:576px; object-fit:cover; object-position:center 25%; }}
.shade {{ position:absolute; inset:auto 0 54px 0; height:340px; background:linear-gradient(to top, rgba(10,18,36,0.95), rgba(10,18,36,0.45) 55%, rgba(10,18,36,0)); }}
.main {{ position:relative; flex:1; padding:40px 56px 32px; display:flex; flex-direction:column; }}
.wordmark {{ font-weight:800; font-stretch:74%; font-size:30px; letter-spacing:0.02em; text-transform:uppercase; }}
.wordmark .dot {{ color:#e8322b; }}
h1 {{ margin-top:auto; font-weight:800; font-stretch:74%; font-size:76px; line-height:1.0; text-transform:uppercase; max-width:13ch; }}
h1 .accent {{ color:#e8322b; }}
.sub {{ margin-top:16px; font-size:21px; line-height:1.45; color:#dbe2ef; max-width:720px; }}
.stats {{ margin-top:24px; display:flex; gap:40px; }}
.stat .n {{ font-weight:800; font-stretch:78%; font-size:40px; line-height:1; }}
.stat .l {{ margin-top:6px; font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#b9c3d6; }}
.band {{ position:relative; background:#e8322b; color:#fff; padding:16px 56px; display:flex; align-items:center; gap:14px; font-size:15px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; }}
</style></head><body>
<div class="card" id="card">
  <img class="art" src="{ART}">
  <div class="shade"></div>
  <div class="main">
    <div class="wordmark">Rivals<span class="dot">&middot;</span>Fantasy</div>
    <h1>The pro season, <span class="accent">drafted by you.</span></h1>
    <p class="sub">Pick real pros by role, run a snake draft with your friends, and score every week from the actual match stats.</p>
    <div class="stats">
      <div class="stat"><div class="n">98</div><div class="l">Pros in the pool</div></div>
      <div class="stat"><div class="n">52</div><div class="l">Pro teams tracked</div></div>
      <div class="stat"><div class="n">16</div><div class="l">Full rosters verified</div></div>
      <div class="stat"><div class="n">9</div><div class="l">Draft rounds</div></div>
    </div>
  </div>
  <div class="band"><span>Snake draft</span><span>&middot;</span><span>Role lineups</span><span>&middot;</span><span>Weekly head-to-head</span><span>&middot;</span><span>Real match stats</span></div>
</div>
</body></html>"""

ICON = """<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a1224; }
.icon { width:180px; height:180px; background:#0a1224; position:relative; }
.dot { position:absolute; left:44px; top:52px; width:16px; height:16px; border-radius:50%; background:#e8322b; }
.r1 { position:absolute; left:76px; top:57px; width:56px; height:15px; background:#f2f5fa; }
.r2 { position:absolute; left:44px; top:92px; width:92px; height:15px; background:#f2f5fa; opacity:0.72; }
.r3 { position:absolute; left:44px; top:122px; width:62px; height:15px; background:#f2f5fa; opacity:0.45; }
</style></head><body><div class="icon" id="icon">
<div class="dot"></div><div class="r1"></div><div class="r2"></div><div class="r3"></div>
</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.set_content(CARD)
    pg.wait_for_timeout(600)
    pg.locator("#card").screenshot(path=OUT_CARD)
    pg2 = b.new_page(viewport={"width": 180, "height": 180}, device_scale_factor=1)
    pg2.set_content(ICON)
    pg2.locator("#icon").screenshot(path=OUT_ICON)
    b.close()
print("wrote", OUT_CARD, os.path.getsize(OUT_CARD), "bytes")
print("wrote", OUT_ICON, os.path.getsize(OUT_ICON), "bytes")

# TY7: the deployed share image is the JPEG the meta tags name,
# re-encoded from the PNG master at a sane weight.
from PIL import Image
with Image.open(OUT_CARD) as im:
    im.convert("RGB").save(OUT_CARD_JPG, "JPEG", quality=60, optimize=True, progressive=True, subsampling=2)
print("wrote", OUT_CARD_JPG, os.path.getsize(OUT_CARD_JPG), "bytes")
