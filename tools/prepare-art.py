"""Turn the full-size art in art/source into small game sprites.

Weapons: extend the shirt sleeve past the right edge (so it never ends on
screen once the launcher is rotated), crop the loaded/empty pair to the same
box, downscale to what the game actually draws, and save as WebP. Writes
src/ui/art.ts with each sprite's size, the wrist pivot and the muzzle tip.

Run: python3 tools/prepare-art.py
"""

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source"
OUT = ROOT / "src" / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)

manifest = json.loads((SRC / "asset-manifest.json").read_text())
WRIST = manifest["alignment"]["wrist_anchor_px"]  # shared by every weapon

# Scene units per source pixel. Every weapon uses the same scale so your hand is
# always the same size, whether it's empty or holding something.
UNIT = 0.31
WEAPONS = {
    "flick": "01_finger_flick",
    "ruler": "02_ruler_launcher",
    "clothespin": "03_clothespin_pistol",
    "repeater": "04_binder_clip_repeater",
    "gatling": "05_drill_gatling",
}
# Where each painted band sits, in source pixels, so the game can draw (and animate)
# its own band on the empty art: the loop at the front hook (cx, cy, rx, ry), and two
# strands from the front to where the band is held at the back.
BANDS = {
    "flick": [{"loop": (1406, 543, 8.5, 25), "front": [(1415, 509), (1415, 531)], "rear": [(1729, 412), (1724, 423)]}],
    "ruler": [{"loop": (988, 506, 7, 10), "front": [(990, 497), (990, 509)], "rear": [(1504, 500), (1504, 508)]}],
    "clothespin": [{"loop": (884, 473, 7, 15), "front": [(889, 446), (889, 460)], "rear": [(1500, 414), (1497, 423)]}],
    "repeater": [
        {"loop": (750, 448, 5, 8), "front": [(752, 445), (752, 451)], "rear": [(1554, 268), (1554, 281)]},
        {"loop": (750, 473, 5, 8), "front": [(752, 470), (752, 476)], "rear": [(1580, 334), (1580, 347)]},
        {"loop": (750, 500, 5, 8), "front": [(752, 497), (752, 503)], "rear": [(1614, 397), (1614, 410)]},
    ],
    "gatling": [],
}
SLEEVE_EXTRA = 900  # source px of sleeve added past the right edge
SHARPNESS = 1.9  # sprite px per scene unit (covers large screens at 2x)


def extend_sleeve(im: Image.Image) -> Image.Image:
    w, h = im.size
    out = Image.new("RGBA", (w + SLEEVE_EXTRA, h), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    col = im.crop((w - 6, 0, w - 5, h))
    for x in range(w - 6, w + SLEEVE_EXTRA):
        out.paste(col, (x, 0))
    return out


INK = (34, 24, 17, 255)
BAND = (226, 182, 120, 255)
RAW_WOOD = (250, 224, 172, 255)

# The ruler is snapped in half: everything left of this jagged line is gone.
# Points run from the top splinter (where the band hooks) down to the bottom edge.
SNAP = [(986, 515), (1008, 530), (990, 548), (1014, 566), (996, 588), (1018, 606), (1000, 626), (1010, 640)]


def snap_ruler(im: Image.Image, loaded: bool) -> Image.Image:
    """Break the ruler off at about 6.5 inches, with a splintered end and the band hooked over the top splinter."""
    ss = 4  # draw at 4x and scale down for smooth edges
    w, h = im.size
    big = lambda pts: [(x * ss, y * ss) for x, y in pts]
    # Keep only what's right of the break (extended straight up and down past the ruler).
    keep = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(keep)
    poly = [(SNAP[0][0], 0)] + SNAP + [(SNAP[-1][0], h), (w, h), (w, 0)]
    d.polygon(big(poly), fill=255)
    keep = keep.resize((w, h), Image.LANCZOS)
    out = im.copy()
    out.putalpha(ImageChops.multiply(im.getchannel("A"), keep))

    over = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    inner = SNAP[1:-1]
    # A strip of raw, lighter wood just inside the break, then splinter lines and the ink outline.
    d.line(big([(x + 9, y) for x, y in inner]), fill=RAW_WOOD, width=9 * ss, joint="curve")
    for (x0, y0), (x1, y1) in zip(inner, inner[1:]):
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        d.line(big([(mx + 4, my), (mx + 30, my + (y1 - y0) * 0.15)]), fill=INK, width=3 * ss)
    d.line(big(SNAP), fill=INK, width=7 * ss, joint="curve")
    for x, y in (SNAP[0], SNAP[-1]):
        d.ellipse([(x - 3.5) * ss, (y - 3.5) * ss, (x + 3.5) * ss, (y + 3.5) * ss], fill=INK)
    if loaded:
        # The band's end, looped over the top splinter.
        hx, hy = SNAP[0]
        box = [(hx - 8) * ss, (hy - 16) * ss, (hx + 16) * ss, (hy + 8) * ss]
        d.arc(box, 95, 290, fill=INK, width=13 * ss)
        d.arc(box, 95, 290, fill=BAND, width=6 * ss)
    over = over.resize((w, h), Image.LANCZOS)
    out.alpha_composite(over)
    return out


def tip_of(im: Image.Image):
    """Leftmost solid point (the muzzle or fingertip)."""
    a = im.getchannel("A")
    x0 = a.point(lambda v: 255 if v > 128 else 0).getbbox()[0]
    ys = [y for x in range(x0, x0 + 8) for y in range(im.height) if a.getpixel((x, y)) > 128]
    return x0, sum(ys) / len(ys)


lines = [
    "// Generated by tools/prepare-art.py from art/source. Do not edit by hand.",
    "// Coordinates are sprite pixels; `unit` is scene units per sprite pixel.",
    "",
]
entries = []
for wid, stem in WEAPONS.items():
    units = UNIT
    loaded = Image.open(SRC / f"{stem}_loaded.png").convert("RGBA")
    empty = Image.open(SRC / f"{stem}_empty.png").convert("RGBA")
    if wid == "ruler":
        loaded, empty = snap_ruler(loaded, True), snap_ruler(empty, False)
    loaded, empty = extend_sleeve(loaded), extend_sleeve(empty)
    tip = tip_of(empty)
    band = manifest["validation"]["pairs"][stem]["different_bbox"]
    if wid == "ruler":
        band = [SNAP[0][0], band[1], band[2], band[3]]
    box = loaded.getbbox()
    eb = empty.getbbox()
    box = (min(box[0], eb[0]) - 4, min(box[1], eb[1]) - 4, max(box[2], eb[2]), max(box[3], eb[3]) + 4)
    r = min(1.0, units * SHARPNESS)
    size = (round((box[2] - box[0]) * r), round((box[3] - box[1]) * r))
    for name, im in (("loaded", loaded), ("empty", empty)):
        im.crop(box).resize(size, Image.LANCZOS).save(OUT / f"{wid}-{name}.webp", quality=90, method=6)
    p = lambda x, y: [round((x - box[0]) * r, 1), round((y - box[1]) * r, 1)]
    bands = [
        {
            "loop": p(b["loop"][0], b["loop"][1]) + [round(b["loop"][2] * r, 1), round(b["loop"][3] * r, 1)],
            "front": [p(*q) for q in b["front"]],
            "rear": [p(*q) for q in b["rear"]],
        }
        for b in BANDS[wid]
    ]
    entries.append(
        f"  {wid}: {{ w: {size[0]}, h: {size[1]}, unit: {units / r:.4f}, wrist: {p(*WRIST)}, tip: {p(*tip)}, band: {p((band[0] + band[2]) / 2, (band[1] + band[3]) / 2)}, bands: {json.dumps(bands)} }},"
    )
    print(wid, size, "scale", round(r, 3), "tip", p(*tip), "box", box)

# Effects: the flying band loop (without its motion lines, since it spins) and the snapped band.
fly = Image.open(SRC / "06_band_flying.png").convert("RGBA")
loop = fly.crop((138, 0, 704, fly.height))
loop = loop.crop(loop.getbbox())
loop.thumbnail((180, 180), Image.LANCZOS)
loop.save(OUT / "band-flying.webp", quality=90, method=6)
snap = Image.open(SRC / "07_band_snapped.png").convert("RGBA")
snap = snap.crop(snap.getbbox())
snap.thumbnail((200, 200), Image.LANCZOS)
snap.save(OUT / "band-snapped.webp", quality=90, method=6)
print("effects", loop.size, snap.size)

# ---------------------------------------------------------------- batch 2: the drawer and deliveries
#
# The drawer is drawn as one sprite; everything that lies in it is sized in "drawer units"
# (source pixels of 08_drawer_open.png, roughly 32 per cm) so things keep real-world proportions.
# The game positions them as fractions of the drawer's width.

b2 = json.loads((SRC / "asset-manifest-batch2.json").read_text())
b2a = {a["file"]: a for a in b2["assets"]}


def solid_box(im: Image.Image, pad: int):
    x0, y0, x1, y1 = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    return (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))


def save_fit(im: Image.Image, box, longest: int, name: str):
    w, h = box[2] - box[0], box[3] - box[1]
    r = min(1.0, longest / max(w, h))
    size = (round(w * r), round(h * r))
    im.crop(box).resize(size, Image.LANCZOS).save(OUT / f"{name}.webp", quality=88, method=6)
    return size, r


drawer = Image.open(SRC / "08_drawer_open.png").convert("RGBA")
dbox = solid_box(drawer, 4)
dsize, dr_ = save_fit(drawer, dbox, 1280, "drawer-open")
DW = dbox[2] - dbox[0]  # drawer width in drawer units
DH = dbox[3] - dbox[1]
fl = b2a["08_drawer_open.png"]["drawer_floor_rect"]
frac = lambda x, y: [round((x - dbox[0]) / DW, 4), round((y - dbox[1]) / DH, 4)]
floor = frac(fl["x"], fl["y"]) + frac(fl["x"] + fl["width"], fl["y"] + fl["height"])
# The pen tray down the left side (measured by eye on the source art).
tray = frac(176, 170) + frac(366, 790)
print("drawer", dsize, "floor", floor, "tray", tray)

closed = Image.open(SRC / "09_drawer_closed.png").convert("RGBA")
icon_size, _ = save_fit(closed, solid_box(closed, 4), 240, "drawer-closed")

# Things in the drawer: (file stem, sprite name, longest side in drawer units, saved longest side in px)
PROPS = {
    "band_a": ("10_band_a", 215, 240),
    "band_b": ("11_band_b", 215, 240),
    "band_c": ("12_band_c", 215, 240),
    "tangle": ("13_band_tangle", 265, 280),
    "ball": ("14_band_ball", 300, 300),
    "stapler": ("15_stapler", 520, 440),
    "clips": ("16_paper_clips", 260, 280),
    "pen": ("17_pen", 450, 400),
    "pencil": ("18_pencil", 330, 320),
    "sticky": ("19_sticky_notes", 250, 260),
    "menu": ("20_takeout_menu", 430, 380),
    "binder": ("21_binder_clip", 175, 200),
    "eraser": ("22_eraser", 190, 200),
    "granola": ("23_granola_bar", 330, 320),
    "change": ("24_loose_change", 280, 280),
}
props = {}
for name, (stem, units, px) in PROPS.items():
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    box = solid_box(im, 6)
    size, _ = save_fit(im, box, px, f"prop-{name}")
    long_src = max(box[2] - box[0], box[3] - box[1])
    # width in fractions of the drawer's width
    props[name] = {"w": size[0], "h": size[1], "dw": round(units * (box[2] - box[0]) / long_src / DW, 4)}
print("props", len(props))

# The hand reaching in: both frames share one crop so they line up at the cuff.
def extend_down(im: Image.Image, extra: int) -> Image.Image:
    """Continue the shirt sleeve straight down past the bottom edge, so your arm never ends on screen."""
    w, h = im.size
    out = Image.new("RGBA", (w, h + extra), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    row = im.crop((0, h - 8, w, h - 7))
    for y in range(h - 8, h + extra):
        out.paste(row, (0, y))
    return out


reach = extend_down(Image.open(SRC / "25_hand_reach.png").convert("RGBA"), 560)
pinch = extend_down(Image.open(SRC / "26_hand_pinch.png").convert("RGBA"), 560)
rb, pb = solid_box(reach, 4), solid_box(pinch, 4)
hbox = (min(rb[0], pb[0]), min(rb[1], pb[1]), max(rb[2], pb[2]), max(rb[3], pb[3]))
hsize, hr_ = save_fit(reach, hbox, 900, "hand-reach")
save_fit(pinch, hbox, 900, "hand-pinch")
HAND_UNITS = 0.77  # drawer units per hand source pixel (cuff to fingertip about 18 cm)
pp = b2a["26_hand_pinch.png"]["pinch_point"]
hand = {
    "w": hsize[0],
    "h": hsize[1],
    "dw": round((hbox[2] - hbox[0]) * HAND_UNITS / DW, 4),
    "pinch": [round((pp[0] - hbox[0]) / (hbox[2] - hbox[0]), 4), round((pp[1] - hbox[1]) / (hbox[3] - hbox[1]), 4)],
}
print("hand", hand)

# Deliveries and paperwork. Box pairs share a crop so the box body doesn't jump when it opens.
desk = {}
for name, stem, px in (("form", "27_order_form", 460), ("stamp", "28_rubber_stamp", 240), ("envelope", "29_envelope", 400)):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 6), px, name)
    desk[name] = {"w": size[0], "h": size[1]}
for name, a, b, px in (("box", "30_box_closed", "31_box_open", 360), ("bulk", "32_box_bulk_closed", "33_box_bulk_open", 480)):
    ia = Image.open(SRC / f"{a}.png").convert("RGBA")
    ib = Image.open(SRC / f"{b}.png").convert("RGBA")
    ba, bb = solid_box(ia, 6), solid_box(ib, 6)
    box = (min(ba[0], bb[0]), min(ba[1], bb[1]), max(ba[2], bb[2]), max(ba[3], bb[3]))
    size, _ = save_fit(ia, box, px, f"{name}-closed")
    save_fit(ib, box, px, f"{name}-open")
    desk[name] = {"w": size[0], "h": size[1]}
desk["drawerIcon"] = {"w": icon_size[0], "h": icon_size[1]}
print("desk", desk)

lines.append(
    "type P = [number, number];\n\n"
    "/** A band the game draws over the empty art: a loop at the front hook (cx, cy, rx, ry) and two strands to the back. */\n"
    "export interface BandRig {\n  loop: [number, number, number, number];\n  front: [P, P];\n  rear: [P, P];\n}\n\n"
    "export interface LauncherSprite {\n  w: number;\n  h: number;\n  unit: number;\n  wrist: P;\n  tip: P;\n  band: P;\n  bands: BandRig[];\n}\n"
)
lines.append("export const SPRITES = {")
lines += [e.replace("[", "[").replace("]", "]") for e in entries]
lines.append("} satisfies Record<string, LauncherSprite>;")
lines.append(f"\nexport const BAND_FLYING = {{ w: {loop.size[0]}, h: {loop.size[1]} }};")
lines.append(f"export const BAND_SNAPPED = {{ w: {snap.size[0]}, h: {snap.size[1]} }};")
lines.append(
    "\n/** The open desk drawer. `floor` and `tray` are [x0, y0, x1, y1] as fractions of the sprite. */\n"
    f"export const DRAWER = {{ w: {dsize[0]}, h: {dsize[1]}, floor: {json.dumps(floor)}, tray: {json.dumps(tray)} }};"
)
lines.append(
    "\n/** Things lying in the drawer. `dw` is the width as a fraction of the drawer's width. */\n"
    "export const PROPS = {\n"
    + "\n".join(f"  {k}: {{ w: {v['w']}, h: {v['h']}, dw: {v['dw']} }}," for k, v in props.items())
    + "\n} as const;\nexport type PropId = keyof typeof PROPS;"
)
lines.append(
    "\n/** Your hand reaching into the drawer (two frames, same crop). `pinch` is a fraction of the sprite. */\n"
    f"export const HAND = {{ w: {hand['w']}, h: {hand['h']}, dw: {hand['dw']}, pinch: {json.dumps(hand['pinch'])} as P }};"
)
lines.append(
    "\n/** Order paperwork and delivery boxes, in sprite pixels. */\n"
    "export const DESK_ART = {\n"
    + "\n".join(f"  {k}: {{ w: {v['w']}, h: {v['h']} }}," for k, v in desk.items())
    + "\n} as const;"
)
(ROOT / "src" / "ui" / "art.ts").write_text("\n".join(lines) + "\n")
