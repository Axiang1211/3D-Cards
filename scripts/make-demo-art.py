"""Generate the original demo artwork used by the gallery.

Every demo card has two layers so the 2.5D parallax is visible:
  <name>-bg.svg  full-bleed background
  <name>-fg.svg  transparent foreground that floats above it

Run:  python3 scripts/make-demo-art.py
"""
import math
import random
from pathlib import Path

W, H = 630, 880
OUT = Path(__file__).resolve().parent.parent / "public" / "gallery"
OUT.mkdir(parents=True, exist_ok=True)


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}" height="{H}"><defs>{defs}</defs>{body}</svg>\n'
    )


def ridge(rng, base, amp, rough, step=6):
    """A mountain silhouette as a closed polygon path."""
    pts = []
    phase = [rng.uniform(0, 6.28) for _ in range(4)]
    for x in range(-10, W + 20, step):
        y = base
        y -= amp * (0.55 * math.sin(x / 140 + phase[0]) + 0.3 * math.sin(x / 61 + phase[1]))
        y -= amp * rough * (0.5 * math.sin(x / 23 + phase[2]) + 0.35 * math.sin(x / 9 + phase[3]))
        pts.append((x, y))
    d = "M-10 %d " % H + " ".join(f"L{x} {y:.1f}" for x, y in pts) + f" L{W + 20} {H} Z"
    return d, pts


def write(name, bg, fg, defs_bg="", defs_fg=""):
    (OUT / f"{name}-bg.svg").write_text(svg(bg, defs_bg))
    (OUT / f"{name}-fg.svg").write_text(svg(fg, defs_fg))


# 1. Ridgeline ---------------------------------------------------------------
def ridgeline():
    rng = random.Random(7)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#1f2a5c"/><stop offset=".45" stop-color="#7a5ca8"/>'
        '<stop offset=".72" stop-color="#e48aa0"/><stop offset="1" stop-color="#ffd4a3"/></linearGradient>'
        '<radialGradient id="sun"><stop offset="0" stop-color="#fff6e0"/><stop offset=".5" stop-color="#ffe0b0"/>'
        '<stop offset="1" stop-color="#ffd0a0" stop-opacity="0"/></radialGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    body += '<circle cx="410" cy="470" r="190" fill="url(#sun)" opacity=".75"/>'
    body += '<circle cx="410" cy="470" r="58" fill="#fff4dc"/>'
    for i, (base, amp, col) in enumerate([(560, 90, "#b77aa6"), (620, 80, "#7d5a92"), (690, 70, "#4b3f78")]):
        d, _ = ridge(rng, base, amp, 0.35 + i * 0.1)
        body += f'<path d="{d}" fill="{col}"/>'
    fg = ""
    d, pts = ridge(rng, 790, 60, 0.4, step=5)
    fg += f'<path d="{d}" fill="#1b1d3a"/>'
    # pines along the nearest ridge
    for x, y in pts[::3]:
        if rng.random() < 0.55:
            h = rng.uniform(40, 110)
            w = h * 0.36
            fg += f'<path d="M{x} {y - h:.1f} L{x + w / 2:.1f} {y + 4:.1f} L{x - w / 2:.1f} {y + 4:.1f} Z" fill="#1b1d3a"/>'
    write("ridgeline", body, fg, defs)


# 2. Tide ----------------------------------------------------------------------
def tide():
    rng = random.Random(3)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#062a3a"/><stop offset=".55" stop-color="#1c6a7a"/>'
        '<stop offset="1" stop-color="#9fd8d0"/></linearGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    body += '<circle cx="190" cy="230" r="70" fill="#f2f7ef"/>'
    body += '<circle cx="190" cy="230" r="120" fill="#f2f7ef" opacity=".08"/>'
    for i in range(70):
        x, y = rng.uniform(0, W), rng.uniform(0, 380)
        body += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rng.uniform(.6, 1.8):.1f}" fill="#e8fff8" opacity="{rng.uniform(.3, .9):.2f}"/>'
    cols = ["#5fb3b0", "#3d8f99", "#2a6f86", "#1d5470"]
    for i, col in enumerate(cols):
        base = 470 + i * 70
        amp = 14 + i * 6
        ph = rng.uniform(0, 6)
        pts = " ".join(f"L{x} {base + amp * math.sin(x / (60 + i * 15) + ph):.1f}" for x in range(-10, W + 20, 8))
        body += f'<path d="M-10 {H} {pts} L{W + 20} {H} Z" fill="{col}"/>'
    fg = ""
    # big front swell with curling crest
    base = 760
    pts = []
    for x in range(-10, W + 20, 6):
        y = base - 70 * math.exp(-((x - 430) / 150) ** 2) + 16 * math.sin(x / 45)
        pts.append((x, y))
    fg += f'<path d="M-10 {H} ' + " ".join(f"L{x} {y:.1f}" for x, y in pts) + f' L{W + 20} {H} Z" fill="#0f3a52"/>'
    fg += f'<path d="' + "M" + " L".join(f"{x} {y + 6:.1f}" for x, y in pts) + '" fill="none" stroke="#dff5ef" stroke-width="5" stroke-linecap="round" opacity=".9"/>'
    for i in range(26):
        x = rng.uniform(0, W)
        y = rng.uniform(800, 870)
        fg += f'<path d="M{x:.0f} {y:.0f} q12 -8 24 0" stroke="#bfe9e2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>'
    write("tide", body, fg, defs)


# 3. Constellation -------------------------------------------------------------
def constellation():
    rng = random.Random(11)
    defs = (
        '<radialGradient id="n1"><stop offset="0" stop-color="#8a4dff" stop-opacity=".75"/>'
        '<stop offset="1" stop-color="#8a4dff" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="n2"><stop offset="0" stop-color="#2fb8ff" stop-opacity=".6"/>'
        '<stop offset="1" stop-color="#2fb8ff" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="n3"><stop offset="0" stop-color="#ff5fa2" stop-opacity=".45"/>'
        '<stop offset="1" stop-color="#ff5fa2" stop-opacity="0"/></radialGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="#080a1e"/>'
    body += '<ellipse cx="200" cy="300" rx="330" ry="240" fill="url(#n1)"/>'
    body += '<ellipse cx="470" cy="560" rx="300" ry="260" fill="url(#n2)"/>'
    body += '<ellipse cx="330" cy="420" rx="200" ry="150" fill="url(#n3)"/>'
    for i in range(320):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.choice([0.6, 0.8, 1.0, 1.2, 1.6, 2.2]) if rng.random() < 0.97 else 3
        body += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#ffffff" opacity="{rng.uniform(.35, 1):.2f}"/>'
    # a constellation line
    star = [(120, 160), (190, 210), (260, 190), (330, 250), (300, 330), (400, 360)]
    body += '<path d="M' + " L".join(f"{x} {y}" for x, y in star) + '" stroke="#cfe0ff" stroke-width="1.2" fill="none" opacity=".6"/>'
    for x, y in star:
        body += f'<circle cx="{x}" cy="{y}" r="3.4" fill="#fff"/>'
    defs_fg = (
        '<linearGradient id="pl" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#ffd9a8"/><stop offset=".5" stop-color="#e2875f"/>'
        '<stop offset="1" stop-color="#4a1f3a"/></linearGradient>'
        '<clipPath id="front"><rect x="0" y="640" width="630" height="240"/></clipPath>'
    )
    cx, cy, r = 430, 650, 120
    ring = f'<ellipse cx="{cx}" cy="{cy}" rx="215" ry="46" transform="rotate(-18 {cx} {cy})" fill="none" stroke="#f2d3b0" stroke-width="12" opacity=".85"/>'
    fg = ring
    fg += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#pl)"/>'
    for i in range(5):
        fg += f'<ellipse cx="{cx}" cy="{cy - 60 + i * 28}" rx="{r * math.sqrt(max(0, 1 - ((-60 + i * 28) / r) ** 2)):.0f}" ry="5" fill="#fff" opacity=".12"/>'
    # front half of the ring passes in front of the planet
    fg += f'<g clip-path="url(#front)">{ring}</g>'
    fg += '<circle cx="150" cy="740" r="34" fill="#c8cbe0"/><circle cx="140" cy="732" r="7" fill="#a6a9c4"/><circle cx="162" cy="752" r="5" fill="#a6a9c4"/>'
    write("constellation", body, fg, defs, defs_fg)


# 4. Glasshouse ----------------------------------------------------------------
def glasshouse():
    rng = random.Random(5)
    defs = (
        '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#f2f5e6"/><stop offset="1" stop-color="#c4d9b8"/></linearGradient>'
        '<radialGradient id="light" cx=".7" cy=".15" r=".7"><stop offset="0" stop-color="#fffbe2" stop-opacity=".9"/>'
        '<stop offset="1" stop-color="#fffbe2" stop-opacity="0"/></radialGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#g)"/>'
    body += f'<rect width="{W}" height="{H}" fill="url(#light)"/>'
    # glasshouse arch + mullions
    body += '<path d="M40 880 V330 Q315 40 590 330 V880" fill="none" stroke="#7f9a7a" stroke-width="10"/>'
    for x in range(110, 560, 70):
        body += f'<line x1="{x}" y1="{200 if 180 < x < 450 else 300}" x2="{x}" y2="880" stroke="#93ab8d" stroke-width="4"/>'
    for y in range(380, 880, 90):
        body += f'<line x1="40" y1="{y}" x2="590" y2="{y}" stroke="#93ab8d" stroke-width="4"/>'
    for i in range(14):
        x, y = rng.uniform(80, 560), rng.uniform(420, 820)
        body += f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rng.uniform(30, 60):.0f}" ry="{rng.uniform(14, 24):.0f}" transform="rotate({rng.uniform(-50, 50):.0f} {x:.0f} {y:.0f})" fill="#8fb184" opacity=".55"/>'
    fg = ""

    def leaf(x, y, length, angle, col, vein="#e8f2d8"):
        a = math.radians(angle)
        tx, ty = x + length * math.cos(a), y + length * math.sin(a)
        nx, ny = -math.sin(a) * length * 0.32, math.cos(a) * length * 0.32
        mx, my = (x + tx) / 2, (y + ty) / 2
        out = (
            f'<path d="M{x:.0f} {y:.0f} Q{mx + nx:.0f} {my + ny:.0f} {tx:.0f} {ty:.0f} '
            f'Q{mx - nx:.0f} {my - ny:.0f} {x:.0f} {y:.0f} Z" fill="{col}"/>'
        )
        out += f'<path d="M{x:.0f} {y:.0f} L{tx:.0f} {ty:.0f}" stroke="{vein}" stroke-width="3" opacity=".6"/>'
        return out

    for (x, y, l, ang, col) in [
        (60, 900, 360, -70, "#2f5a3a"), (20, 880, 300, -40, "#3b6d45"),
        (600, 900, 380, -115, "#2a4f34"), (640, 860, 280, -150, "#406f48"),
        (300, 920, 260, -95, "#355f3e"), (-20, 700, 220, -20, "#4a7d50"),
    ]:
        fg += leaf(x, y, l, ang, col)
    write("glasshouse", body, fg, defs)


# 5. Night tram ----------------------------------------------------------------
def night():
    rng = random.Random(21)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#0d1030"/><stop offset=".6" stop-color="#2b2059"/>'
        '<stop offset="1" stop-color="#8a3e6e"/></linearGradient>'
    )
    body = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    x = -10
    while x < W:
        w = rng.uniform(50, 110)
        h = rng.uniform(250, 560)
        top = H - h
        col = rng.choice(["#1a1838", "#211d46", "#17153a"])
        body += f'<rect x="{x:.0f}" y="{top:.0f}" width="{w:.0f}" height="{h:.0f}" fill="{col}"/>'
        for wy in range(int(top) + 16, H - 10, 22):
            for wx in range(int(x) + 8, int(x + w) - 12, 16):
                if rng.random() < 0.38:
                    c = rng.choice(["#ffd58a", "#ffe9b8", "#9fd6ff", "#ff9fc2"])
                    body += f'<rect x="{wx}" y="{wy}" width="8" height="11" fill="{c}" opacity="{rng.uniform(.55, 1):.2f}"/>'
        x += w + rng.uniform(4, 14)
    fg = ""
    # overhead wires
    fg += '<path d="M-10 120 Q315 190 640 110" stroke="#0b0b1e" stroke-width="3" fill="none"/>'
    fg += '<path d="M-10 160 Q315 230 640 150" stroke="#0b0b1e" stroke-width="2" fill="none"/>'
    # street lamp
    fg += '<rect x="498" y="300" width="12" height="600" fill="#0b0b1e"/>'
    fg += '<path d="M504 300 Q504 250 440 250" stroke="#0b0b1e" stroke-width="10" fill="none"/>'
    fg += '<path d="M410 250 h60 l-12 22 h-36 Z" fill="#0b0b1e"/>'
    fg += '<ellipse cx="440" cy="276" rx="16" ry="6" fill="#fff1c4"/>'
    fg += '<path d="M424 276 L360 880 L540 880 L456 276 Z" fill="#ffe7a8" opacity=".12"/>'
    # ground
    fg += '<rect x="0" y="840" width="630" height="40" fill="#0b0b1e"/>'
    write("night", body, fg, defs)


# 6. Mono ----------------------------------------------------------------------
def mono():
    body = f'<rect width="{W}" height="{H}" fill="#ecebe6"/>'
    body += '<circle cx="315" cy="420" r="230" fill="#1e1f24"/>'
    body += '<circle cx="315" cy="420" r="230" fill="none" stroke="#1e1f24" stroke-width="2" transform="translate(40 40)"/>'
    for i in range(1, 9):
        body += f'<line x1="0" y1="{700 + i * 18}" x2="630" y2="{700 + i * 18}" stroke="#1e1f24" stroke-width="{0.6 + i * 0.35:.2f}"/>'
    fg = '<circle cx="408" cy="300" r="62" fill="#ecebe6"/>'
    fg += '<circle cx="408" cy="300" r="62" fill="none" stroke="#1e1f24" stroke-width="3"/>'
    fg += '<circle cx="190" cy="560" r="18" fill="#ecebe6"/>'
    write("mono", body, fg)


for fn in (ridgeline, tide, constellation, glasshouse, night, mono):
    fn()
print("written to", OUT)
