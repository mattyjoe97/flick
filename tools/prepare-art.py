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

# ---------------------------------------------------------------- batch 3: Dale's supply closet

b3 = {a["file"]: a for a in json.loads((SRC / "asset-manifest-batch3.json").read_text())["assets"]}
closet_art = {}

# Dale's three poses share one canvas, so they share one crop.
poses = {p: Image.open(SRC / f"{n}_dale_{p}.png").convert("RGBA") for n, p in ((34, "idle"), (35, "talk"), (36, "open"))}
boxes = [solid_box(im, 6) for im in poses.values()]
dbox3 = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
for p, im in poses.items():
    size, _ = save_fit(im, dbox3, 900, f"dale-{p}")
fc = b3["34_dale_idle.png"]["face_center"]
closet_art["dale"] = {
    "w": size[0],
    "h": size[1],
    "face": [round((fc[0] - dbox3[0]) / (dbox3[2] - dbox3[0]), 4), round((fc[1] - dbox3[1]) / (dbox3[3] - dbox3[1]), 4)],
}
# A head-and-shoulders crop of Dale for the desk card.
head = poses["idle"].crop((fc[0] - 250, fc[1] - 330, fc[0] + 250, fc[1] + 250))
head.thumbnail((200, 232), Image.LANCZOS)
head.save(OUT / "dale-head.webp", quality=86, method=6)
closet_art["daleHead"] = {"w": head.size[0], "h": head.size[1]}

psst = Image.open(SRC / "37_dale_psst.png").convert("RGBA")
size, _ = save_fit(psst, solid_box(psst, 4), 440, "dale-psst")
closet_art["psst"] = {"w": size[0], "h": size[1]}

room = Image.open(SRC / "38_closet.png").convert("RGB")
rw, rh = room.size
room.resize((1600, round(1600 * rh / rw)), Image.LANCZOS).save(OUT / "closet.webp", quality=82, method=6)
cm = b3["38_closet.png"]
pr, tr = cm["pegboard_rectangle"], cm["table_top_rectangle"]
fr = lambda r: [round(r["x"] / rw, 4), round(r["y"] / rh, 4), round((r["x"] + r["width"]) / rw, 4), round((r["y"] + r["height"]) / rh, 4)]
closet_art["room"] = {"w": rw, "h": rh, "pegboard": fr(pr), "table": fr(tr)}

for wid, stem in (("ruler", "39_ruler"), ("clothespin", "40_clothespin"), ("repeater", "41_repeater"), ("gatling", "42_gatling")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 6), 640, f"gun-{wid}")
    closet_art[f"gun_{wid}"] = {"w": size[0], "h": size[1]}
for uid, stem in (("silent", "43_icon_silent"), ("rummage", "44_icon_rummage"), ("training", "45_icon_training"), ("calendar", "46_icon_calendar"),
                  ("closet", "47_icon_key"), ("thick", "48_icon_thick_bands"), ("waxed", "49_icon_waxed_bands")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 6), 240, f"icon-{uid}")
    closet_art[f"icon_{uid}"] = {"w": size[0], "h": size[1]}
print("closet", closet_art)

# ---------------------------------------------------------------- batch 5: the desk, office upgrades and money

wood = Image.open(SRC / "95_desk_wood.png").convert("RGB")
wood.resize((512, 512), Image.LANCZOS).save(OUT / "desk-wood.webp", quality=84, method=6)
mat = Image.open(SRC / "96_desk_mat.png").convert("RGB")
mat.resize((512, 1024), Image.LANCZOS).save(OUT / "desk-mat.webp", quality=86, method=6)
b5 = {a["file"]: a for a in json.loads((SRC / "asset-manifest-batch5.json").read_text())["assets"]}
closet_art["mat"] = {"w": 512, "h": 1024, "slice": b5["96_desk_mat.png"]["plain_center_insets_px"]["left"] // 2}
for name, stem, px in (("plant", "97_plant", 300), ("clipboard", "98_clipboard", 420), ("coin", "107_coin", 96), ("cash", "108_cash", 160)):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 6), px, name)
    closet_art[name] = {"w": size[0], "h": size[1]}
for uid, stem in (("organizer", "99_icon_organizer"), ("autoreply", "100_icon_autoreply"), ("chair", "101_icon_chair"), ("riser", "102_icon_riser"),
                  ("bulk", "103_icon_bulk"), ("carpet", "104_icon_carpet"), ("macros", "105_icon_macros"), ("walls", "106_icon_walls")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 6), 240, f"icon-{uid}")
    closet_art[f"icon_{uid}"] = {"w": size[0], "h": size[1]}
print("batch 5 done")

# ---------------------------------------------------------------- batch 6: the computer, lackeys and the rubber band ball

b6 = {a["file"]: a for a in json.loads((SRC / "asset-manifest-batch6.json").read_text())["assets"]}
# The monitor bezel is a nine-slice frame: keep its geometry exact, at half size.
bez = Image.open(SRC / "109_monitor_bezel.png").convert("RGBA")
bez.resize((512, 512), Image.LANCZOS).save(OUT / "monitor-bezel.webp", quality=90, method=6)
reg = b6["109_monitor_bezel.png"]["registration"]
closet_art["bezel"] = {"w": 512, "h": 512, "slice": reg["nine_slice_insets"]["left"] // 2, "frame": reg["frame_thickness"] // 2}
for name, stem, px in (
    ("monitor-badge", "110_monitor_badge", 256),
    ("keyboard", "111_keyboard", 800),
    ("mouse", "112_mouse", 256),
    ("desk-phone", "113_desk_phone", 384),
    ("grade-ring", "135_grade_ring", 256),
    ("ink-stamp", "134_ink_stamp_frame", 450),
    ("ball-1", "147_band_ball_1", 384),
    ("ball-2", "148_band_ball_2", 384),
    ("ball-3", "149_band_ball_3", 384),
    ("ball-4", "150_band_ball_4", 384),
):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    size, _ = save_fit(im, solid_box(im, 4), px, name)
    closet_art[name.replace("-", "_")] = {"w": size[0], "h": size[1]}
# The receipt keeps its full canvas so the game can nine-slice its torn edges.
rc = Image.open(SRC / "133_receipt.png").convert("RGBA")
rc.resize((320, 512), Image.LANCZOS).save(OUT / "receipt.webp", quality=88, method=6)
# The flying stapler: both frames share one crop so only the wings move.
fa, fb = (Image.open(SRC / f"{n}.png").convert("RGBA") for n in ("131_stapler_fly_a", "132_stapler_fly_b"))
ba, bb = solid_box(fa, 4), solid_box(fb, 4)
sbox = (min(ba[0], bb[0]), min(ba[1], bb[1]), max(ba[2], bb[2]), max(ba[3], bb[3]))
for im, name in ((fa, "stapler-a"), (fb, "stapler-b")):
    size, _ = save_fit(im, sbox, 220, name)
closet_art["stapler"] = {"w": size[0], "h": size[1]}
for name, stem in (("corporate", "114_wallpaper_corporate"), ("beach", "115_wallpaper_beach"), ("teamwork", "116_wallpaper_teamwork"), ("skyline", "117_wallpaper_skyline")):
    Image.open(SRC / f"{stem}.png").convert("RGB").resize((1280, 800), Image.LANCZOS).save(OUT / f"wall-{name}.webp", quality=82, method=6)
for name, stem in (("mail", "118_icon_app_mail"), ("phone", "119_icon_app_phone"), ("sheet", "120_icon_app_sheet"), ("expenses", "121_icon_app_expenses"),
                   ("chat", "122_icon_app_messenger"), ("catalog", "123_icon_app_catalog"), ("org", "124_icon_app_org"), ("staffing", "125_icon_app_staffing"),
                   ("trash", "126_icon_recycle_empty"), ("trash-full", "127_icon_recycle_full"), ("folder", "128_icon_folder"), ("doc", "129_icon_document"),
                   ("solitaire", "130_icon_solitaire")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    im.resize((128, 128), Image.LANCZOS).save(OUT / f"app-{name}.webp", quality=88, method=6)
print("batch 6 done")

# ---------------------------------------------------------------- batch 7: the office pets and your ID badge
#
# Every pet shares one scale and a floor line, so each animal's poses share one crop (the
# union of its poses) and the game swaps them in place; the crop boxes are recorded so the
# animals can be drawn at the right sizes next to each other.
pets = {
    "bailey": ["163_bailey_sit", "164_bailey_sleep", "165_bailey_howl", "166_bailey_fetch", "167_bailey_happy", "168_dog_bed"],
    "joey": ["169_joey_sit", "170_joey_ball", "171_joey_derp"],
    "muffins": ["172_muffins_loaf", "173_muffins_swat", "174_muffins_sleep"],
}
PET_SCALE = 0.55  # every pet is drawn at this share of its 1024px canvas
pet_art = {}
for animal, stems in pets.items():
    ims = {st: Image.open(SRC / f"{st}.png").convert("RGBA") for st in stems}
    bxs = [solid_box(im, 4) for im in ims.values()]
    box = (min(b[0] for b in bxs), min(b[1] for b in bxs), max(b[2] for b in bxs), 961)
    size = (round((box[2] - box[0]) * PET_SCALE), round((box[3] - box[1]) * PET_SCALE))
    for st, im in ims.items():
        name = "pet-" + st.split("_", 1)[1].replace("_", "-")
        im.crop(box).resize(size, Image.LANCZOS).save(OUT / f"{name}.webp", quality=88, method=6)
    pet_art[animal] = {"w": size[0], "h": size[1], "x": box[0], "y": box[1]}
badge = Image.open(SRC / "175_id_badge.png").convert("RGBA")
badge.resize((320, 500), Image.LANCZOS).save(OUT / "id-badge.webp", quality=90, method=6)
closet_art["pets"] = pet_art
closet_art["idBadge"] = {"w": 320, "h": 500, "photo": [70, 125, 180, 225]}
print("batch 7 done", pet_art)

# ---------------------------------------------------------------- batch 8: the Department War
#
# The four barricades share one canvas (1400 x 800, at the portraits' scale, resting on a
# desk line at y=780), so they share one crop and the game places them all the same way.
# `middle` is how high each one comes up in the middle (where the boss's face shows).
b8 = {a["file"]: a for a in json.loads((SRC / "asset-manifest-batch8.json").read_text())["assets"]}
# (The HR Director's barricade from batch 10 shares the format, so it rides along.)
cover_stems = {"it": "192_cover_it", "accounting": "193_cover_accounting", "mailroom": "194_cover_mailroom", "marketing": "195_cover_marketing", "hr": "215_cover_hr", "law": "246_cover_law", "dental": "247_cover_dental", "startup": "248_cover_startup"}
cims = {k: Image.open(SRC / f"{st}.png").convert("RGBA") for k, st in cover_stems.items()}
cbxs = [solid_box(im, 4) for im in cims.values()]
cbox = (min(b[0] for b in cbxs), min(b[1] for b in cbxs), max(b[2] for b in cbxs), max(b[3] for b in cbxs))
middle = {}
for k, im in cims.items():
    csize, cr = save_fit(im, cbox, 760, f"cover-{k}")
    mid = im.crop((500, 0, 901, im.height)).getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    middle[k] = mid[1] if mid else 780
closet_art["covers"] = {"w": csize[0], "h": csize[1], "box": list(cbox), "desk": 780, "centerX": 700, "middle": middle}
flag = Image.open(SRC / "196_white_flag.png").convert("RGBA")
fbox = solid_box(flag, 4)
fsize, fr = save_fit(flag, fbox, 256, "white-flag")
fb = b8["196_white_flag.png"]["registration"]["ruler_bottom_end_point"]
closet_art["flag"] = {"w": fsize[0], "h": fsize[1], "foot": [round((fb[0] - fbox[0]) / (fbox[2] - fbox[0]), 4), round((fb[1] - fbox[1]) / (fbox[3] - fbox[1]), 4)]}
print("batch 8 done", closet_art["covers"], closet_art["flag"])

# ---------------------------------------------------------------- batch 9: Floor Domination
#
# The two rooms' filing-cabinet walls share the barricades' format (1400 x 800, portrait
# scale, desk line at y=780), standing and broken on one canvas with identical end towers,
# so all four share one crop and swap in place. `top` is how high each standing wall's
# middle comes up (the game lines that up with the boss's nose).
b9 = {a["file"]: a for a in json.loads((SRC / "asset-manifest-batch9.json").read_text())["assets"]}
wall_stems = {
    "breakroom-standing": "205_wall_breakroom_standing", "breakroom-broken": "206_wall_breakroom_broken",
    "conference-standing": "207_wall_conference_standing", "conference-broken": "208_wall_conference_broken",
}
wims = {k: Image.open(SRC / f"{st}.png").convert("RGBA") for k, st in wall_stems.items()}
wbxs = [solid_box(im, 4) for im in wims.values()]
wbox = (min(b[0] for b in wbxs), min(b[1] for b in wbxs), max(b[2] for b in wbxs), max(b[3] for b in wbxs))
for k, im in wims.items():
    wsize, _ = save_fit(im, wbox, 760, f"roomwall-{k}")
wtop = {r: b9[f"{wall_stems[r + '-standing']}.png"]["registration"]["middle_topmost_alpha_y"] for r in ("breakroom", "conference")}
closet_art["roomWalls"] = {"w": wsize[0], "h": wsize[1], "box": list(wbox), "desk": 780, "centerX": 700, "top": wtop}
for name, stem in (("unplug", "209_icon_unplug"), ("replyall", "210_icon_replyall")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    im.resize((96, 96), Image.LANCZOS).save(OUT / f"icon-{name}.webp", quality=88, method=6)
print("batch 9 done", closet_art["roomWalls"])

# ---------------------------------------------------------------- batch 10: Corporate Politics
#
# Leonard Fisk's portraits go in with the coworkers and his barricade with batch 8's; here
# are the Memos app icon (with the other app icons) and HR's case file.
im = Image.open(SRC / "216_icon_app_memos.png").convert("RGBA")
im.resize((128, 128), Image.LANCZOS).save(OUT / "app-memos.webp", quality=88, method=6)
im = Image.open(SRC / "217_icon_case_file.png").convert("RGBA")
im.resize((96, 96), Image.LANCZOS).save(OUT / "icon-casefile.webp", quality=88, method=6)
print("batch 10 done")

# ---------------------------------------------------------------- batch 11: renovation icons
#
# The four renovations on Dale's Procurement clipboard, cut like the other office upgrades.
for uid, stem in (("window", "218_icon_reno_window"), ("espresso", "219_icon_reno_espresso"), ("desks", "220_icon_reno_desks"), ("panels", "221_icon_reno_panels")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    save_fit(im, solid_box(im, 6), 240, f"icon-reno-{uid}")
print("batch 11 done")

# ---------------------------------------------------------------- batch 12: window views
#
# What you see out of the office windows on each floor of the career ladder: one wide strip
# behind both windows (the sky is the game's own, so it stays transparent).
for floor, stem in ((4, "222_view_floor4"), (12, "223_view_floor12"), (30, "224_view_floor30")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    im.resize((1024, 248), Image.LANCZOS).save(OUT / f"view-floor{floor}.webp", quality=86, method=6)
print("batch 12 done")

# ---------------------------------------------------------------- batch 13: Chad, the golden stapler, office chaos
#
# Chad's portraits go in with the coworkers (smug, gloat -> happy, sulk -> worried). Here: the
# golden stapler (cut like the flying ones), the four chaos icons for the pill on the office
# picture, and the Challenges app icon (with the other app icons).
im = Image.open(SRC / "228_golden_stapler.png").convert("RGBA")
save_fit(im, solid_box(im, 4), 220, "golden-stapler")
for kind, stem in (("drill", "229_icon_chaos_drill"), ("outage", "230_icon_chaos_outage"), ("cake", "231_icon_chaos_cake"), ("inspection", "232_icon_chaos_inspection")):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA")
    save_fit(im, solid_box(im, 4), 96, f"icon-chaos-{kind}")
im = Image.open(SRC / "233_icon_app_challenges.png").convert("RGBA")
im.resize((128, 128), Image.LANCZOS).save(OUT / "app-challenges.webp", quality=88, method=6)
print("batch 13 done")

# ---------------------------------------------------------------- batch 14: Building Takeover
#
# The three bosses go in with the coworkers and their barricades with batch 8's (same format);
# here is Dr. Gleam's floss, laid over your launcher when she snares it.
im = Image.open(SRC / "249_floss_snare.png").convert("RGBA")
save_fit(im, solid_box(im, 4), 400, "floss-snare")
print("batch 14 done")

# ---------------------------------------------------------------- batch 4: the coworkers
#
# Every portrait shares one registration (face centre, eye line, head size), so they all
# share one crop and the game places them all the same way.

b4 = json.loads((SRC / "asset-manifest-batch4.json").read_text())
faces = sorted(
    (f for f in SRC.glob("*_*.png") if f.stem.split("_")[0].isdigit() and (50 <= int(f.stem.split("_")[0]) <= 94 or 136 <= int(f.stem.split("_")[0]) <= 146 or 151 <= int(f.stem.split("_")[0]) <= 162 or 176 <= int(f.stem.split("_")[0]) <= 191 or 197 <= int(f.stem.split("_")[0]) <= 204 or 211 <= int(f.stem.split("_")[0]) <= 214 or 225 <= int(f.stem.split("_")[0]) <= 227 or 234 <= int(f.stem.split("_")[0]) <= 245)),
    key=lambda f: int(f.stem.split("_")[0]),
)
# The crop comes from the original cast (and Feeney's peer pose). The temp's tall bun would
# otherwise push the crop up and shrink every face, so the very top of her bun is trimmed.
pboxes = [solid_box(Image.open(f).convert("RGBA"), 4) for f in faces if int(f.stem.split("_")[0]) <= 136]
pbox = (min(b[0] for b in pboxes), min(b[1] for b in pboxes), max(b[2] for b in pboxes), max(b[3] for b in pboxes))
PW = 400
portraits = {}
for f in faces:
    _, who, mood = f.stem.split("_", 2) if f.stem.count("_") == 2 else (None, *f.stem.split("_", 1)[1].rsplit("_", 1))
    mood = {"gloat": "happy", "sulk": "worried"}.get(mood, mood)  # Chad's faces, in the game's moods
    who = {"taskforce_a": "tf1", "taskforce_b": "tf2", "taskforce_c": "tf3", "assistant_manager": "manager", "you_rank1": "you1", "you_rank2": "you2", "you_rank3": "you3", "you_rank4": "you4"}.get(who, who)
    im = Image.open(f).convert("RGBA")
    size, _ = save_fit(im, pbox, PW, f"face-{who}-{mood}")
    portraits.setdefault(who, []).append(mood)
common = b4["common_alignment"]
print("portraits", {k: v for k, v in portraits.items()}, "box", pbox, "size", size)

out = [
    "// Generated by tools/prepare-art.py from art/source. Do not edit by hand.",
    "// Painted coworker portraits (one per facial expression) and Dale's closet.",
    "",
]
for who, moods in portraits.items():
    for mood in moods:
        out.append(f"import {who}_{mood} from '../assets/art/face-{who}-{mood}.webp';")
out.append("")
out.append("/** Every portrait shares this crop of a 1024 x 1280 canvas, and this face registration. */")
out.append(
    f"export const PORTRAIT = {{ crop: {json.dumps(list(pbox))}, w: {size[0]}, h: {size[1]}, face: {json.dumps(common['face_center'])}, earToEar: {common['ear_to_ear_width']} }};"
)
out.append("")
out.append("export const PORTRAITS: Record<string, Record<string, string>> = {")
for who, moods in portraits.items():
    out.append(f"  {who}: {{ " + ", ".join(f"{m}: {who}_{m}" for m in moods) + " },")
out.append("};")
out.append("")
out.append("/** Dale and his closet, in sprite pixels; `face`, `pegboard` and `table` are fractions. */")
out.append("export const CLOSET_ART = " + json.dumps(closet_art) + " as const;")
(ROOT / "src" / "ui" / "portrait-art.ts").write_text("\n".join(out) + "\n")
