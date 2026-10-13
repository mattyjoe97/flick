FLICK — 2D office rubber-band game art

CONTENTS
12 transparent PNG sprites:
- 5 weapons, each supplied as loaded and empty variants (10 images).
- 2 effects: a flying rubber band and a snapped rubber band.

DIMENSIONS
Weapon sprites: 2048 x 1024 pixels (2:1 landscape).
Effect sprites: 1024 x 1024 pixels (square).
PNG RGBA transparency; there is no background layer.

USE
Keep each weapon on its full canvas when swapping sprites. The weapons use
the same normalized canvas anchor and common cuff/sleeve registration.
The sleeve continues to the right edge; the weapon points left.
Each loaded/empty pair shares its base pixels outside the rubber-band changes.
Avoid independently trimming or recentering a pair, which would change alignment.
The two effects use independent square canvases.

PROVENANCE
Artwork generated with built-in imagegen from the supplied office reference.
User-authorized Python/Pillow finishing sets exact dimensions, cleans alpha,
aligns the assets, and builds matching loaded/empty pairs from shared bases.
prompts.json preserves all generation prompts and reference roles, including
historical drafts and intermediate generation outcomes.
