#!/usr/bin/env python3
"""Make every image the site shows in the sizes it needs, in AVIF and WebP.
  assets/img/stage/*.jpg        -> assets/img/stage/<name>-{640,1024,1440}.{avif,webp}  + a 24px blur placeholder in stage.json
  assets/img/*.jpg (key art)    -> same
  assets/img/heroes/*.png       -> assets/img/heroes/<name>.{avif,webp} (alpha kept; 4.0 MB of PNG becomes 0.6 MB AVIF / 1.0 MB WebP)
Originals stay in the repo as the source of truth; pages only ever load the made files.
Run:  python3 scripts/optimize-images.py        (needs Pillow 11.3+ for AVIF)
"""
import json, os, sys
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "img"
WIDTHS = (640, 1024, 1440)
meta = {}

def tone(im):
    """the average colour, as a hex string, used as the placeholder colour while the image loads"""
    r, g, b = im.convert("RGB").resize((1, 1), Image.BOX).getpixel((0, 0))
    return "#%02x%02x%02x" % (r, g, b)

def make(src: Path, out_dir: Path):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    made = []
    for tw in WIDTHS:
        if tw > w * 1.05 and tw != WIDTHS[0]:
            continue
        nominal = tw
        tw = min(tw, w)           # never enlarge; the file keeps its nominal name
        r = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
        for ext, kw in (("avif", dict(quality=48, speed=6)), ("webp", dict(quality=76, method=6))):
            p = out_dir / f"{src.stem}-{nominal}.{ext}"
            r.save(p, ext.upper(), **kw); made.append(p.name)
    meta[str(src.relative_to(IMG))] = {"w": w, "h": h, "tone": tone(im), "sizes": sorted({int(n.split('-')[-1].split('.')[0]) for n in made})}

for d in (IMG / "stage", IMG):
    for f in sorted(d.glob("*.jpg")):
        make(f, d)
for f in sorted((IMG / "heroes").glob("*.png")):
    im = Image.open(f).convert("RGBA")
    im.save(f.with_suffix(".avif"), "AVIF", quality=60, speed=6)
    im.save(f.with_suffix(".webp"), "WEBP", quality=90, alpha_quality=100, method=6)
(IMG / "image-meta.json").write_text(json.dumps(meta, indent=1))
print("ok", len(meta), "photos,", len(list((IMG / "heroes").glob("*.webp"))), "portraits")
