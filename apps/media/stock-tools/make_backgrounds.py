"""
WorshipHQ stock backgrounds: original pictures (3840x2160) and seamless motion loops (1920x1080, 30 fps),
all generated from code, so WorshipHQ owns every pixel and can give them to churches freely.

Usage:  python -I make_backgrounds.py <out-dir> [images|videos|all] [only-name]
Writes <out-dir>/images/*.jpg, <out-dir>/videos/*.mp4, <out-dir>/thumbs/*.jpg and <out-dir>/manifest.json.
"""
import json, math, os, subprocess, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W4, H4 = 3840, 2160
VW, VH = 960, 540          # videos are drawn at this size, then scaled to 1080p with lanczos (soft content)
FPS, SECONDS = 30, 20
FRAMES = FPS * SECONDS
TAU = math.pi * 2

PALETTES = {
    "teal-dawn":   ["#04252b", "#0d9488", "#5eead4", "#0f3d5c", "#f0b67f"],
    "royal":       ["#12052e", "#4c1d95", "#7c3aed", "#1e1b4b", "#c084fc"],
    "gold":        ["#1c0f02", "#92400e", "#f59e0b", "#3b2106", "#fde68a"],
    "ocean":       ["#020c1b", "#0c4a6e", "#0284c7", "#082f49", "#7dd3fc"],
    "rose":        ["#2a0612", "#9f1239", "#fb7185", "#4a0d22", "#fecdd3"],
    "forest":      ["#03140c", "#14532d", "#22c55e", "#052e16", "#bbf7d0"],
    "crimson":     ["#180204", "#7f1d1d", "#dc2626", "#2b0508", "#fca5a5"],
    "midnight":    ["#020617", "#1e293b", "#334155", "#0f172a", "#94a3b8"],
    "sunrise":     ["#1a0b2e", "#7e2553", "#f97316", "#3b0764", "#fde047"],
    "mint":        ["#06201c", "#115e59", "#2dd4bf", "#134e4a", "#ccfbf1"],
}

def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0

def grid(w, h):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    return x / w, y / h

def smooth_noise(w, h, cells, rng, octaves=4):
    """Fractal value noise in 0..1 (random grids upscaled with bicubic)."""
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        c = max(2, int(cells * 2 ** o))
        small = rng.random((max(2, int(c * h / w)), c)).astype(np.float32)
        layer = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        out += layer * amp
        total += amp
        amp *= 0.5
    return out / total

def to_img(rgb, grain=0.012, rng=None):
    rgb = np.clip(rgb, 0, 1)
    if grain and rng is not None:
        rgb = np.clip(rgb + (rng.random(rgb.shape[:2], dtype=np.float32)[..., None] - 0.5) * grain, 0, 1)
    return Image.fromarray((rgb * 255 + 0.5).astype(np.uint8))

def vignette(x, y, strength=0.55):
    d = np.sqrt((x - 0.5) ** 2 * 1.2 + (y - 0.5) ** 2 * 1.6)
    return np.clip(1 - strength * d ** 1.8, 0, 1)[..., None]

# ---------------------------------------------------------------- picture styles
def mesh(w, h, pal, rng, centers=None):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    rgb = np.zeros((h, w, 3), np.float32) + cols[0]
    pts = centers if centers is not None else [(rng.random(), rng.random(), 0.25 + rng.random() * 0.35) for _ in range(5)]
    for i, (cx, cy, r) in enumerate(pts):
        g = np.exp(-(((x - cx) * 1.78) ** 2 + (y - cy) ** 2) / (2 * r * r))[..., None]
        rgb = rgb * (1 - g * 0.85) + cols[1 + i % 4] * g * 0.85
    return rgb * vignette(x, y, 0.45)

def bokeh_layer(img, w, h, pal, rng, n, scale=1.0, positions=None, alpha=0.5):
    """Soft discs with a slightly brighter rim, drawn on a PIL RGBA layer."""
    cols = [hex2rgb(c) for c in pal[2:]]
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(n):
        if positions is not None:
            px, py, r, a = positions[i]
        else:
            px, py = rng.random() * w, rng.random() * h
            r = (0.015 + rng.random() ** 2 * 0.06) * w * scale
            a = 0.25 + rng.random() * 0.6
        c = cols[i % len(cols)]
        rgb = tuple(int(v * 255) for v in c)
        d.ellipse([px - r, py - r, px + r, py + r], fill=rgb + (int(255 * a * alpha * 0.55),), outline=rgb + (int(255 * a * alpha),), width=max(1, int(r * 0.06)))
    layer = layer.filter(ImageFilter.GaussianBlur(max(1, w / 900)))
    base = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    return np.asarray(Image.alpha_composite(base, layer).convert("RGB"), np.float32) / 255

def rays(w, h, pal, rng, phase=0.0, noise=None):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    base = cols[0] * (1 - y[..., None]) * 0.6 + cols[3] * y[..., None] * 0.9 + cols[0] * 0.4
    ang = np.arctan2(x - 0.5, y + 0.25)
    beams = np.zeros_like(x)
    for k, (f, p, a) in enumerate([(9, 0.3, 0.5), (17, 1.7, 0.35), (31, 2.9, 0.25), (5, 4.1, 0.45)]):
        beams += a * (0.5 + 0.5 * np.sin(ang * f + p + phase * (1 + k * 0.5) * (1 if k % 2 else -1)))
    beams = (beams / 1.55) ** 3
    fall = np.exp(-((y + 0.05) * 1.6)) * np.exp(-((x - 0.5) ** 2) * 3)
    glow = np.exp(-(((x - 0.5) * 1.78) ** 2 + (y + 0.05) ** 2) / 0.06)
    light = (beams * fall * 0.9 + glow * 0.8)[..., None]
    if noise is not None:
        light = light * (0.75 + 0.5 * noise[..., None])
    return base + light * cols[4] * 0.9 + light ** 2 * 0.25

def stars(w, h, pal, rng, n=None, twinkle=None, nebula=None):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    neb = nebula if nebula is not None else smooth_noise(w, h, 3, rng, 5)
    rgb = cols[0] + (neb[..., None] ** 2.2) * (cols[1] * 0.9 + cols[2] * 0.35)
    rgb = rgb * vignette(x, y, 0.5)
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    srng = np.random.default_rng(7)
    count = n or int(w * h / 4000)
    for i in range(count):
        px, py = srng.random() * w, srng.random() * h
        b = srng.random() ** 3
        if twinkle is not None:
            b *= 0.55 + 0.45 * math.sin(twinkle * (1 + (i % 3)) + i)
        r = (0.4 + b * 1.6) * w / 1920
        v = int(140 + 115 * b)
        d.ellipse([px - r, py - r, px + r, py + r], fill=(v, v, min(255, v + 10)))
    return np.asarray(img, np.float32) / 255

def waves(w, h, pal, rng, phase=0.0):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    rgb = cols[0] * (1 - y[..., None]) + cols[3] * y[..., None]
    for k in range(6):
        cy = 0.38 + k * 0.07 + 0.06 * np.sin(x * TAU * (0.6 + k * 0.17) + k * 1.3 + phase * (1 if k % 2 else -1))
        band = np.exp(-((y - cy) ** 2) / (0.0009 + k * 0.0004))
        rgb = rgb + band[..., None] * cols[1 + k % 4] * (0.55 - k * 0.05)
    return rgb * vignette(x, y, 0.4)

def aurora(w, h, pal, rng, phase=0.0):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    rgb = cols[0] * (0.7 + 0.3 * y[..., None])
    for k in range(4):
        cy = 0.32 + 0.1 * k + 0.08 * np.sin(x * TAU * (0.8 + 0.3 * k) + phase * (1 + 0.5 * k) + k)
        curtain = np.exp(-np.clip(y - cy, 0, None) * 7) * (y < cy + 0.5) * np.exp(-np.clip(cy - y, 0, None) * 30)
        streak = 0.82 + 0.18 * np.sin(x * 40 + k * 2 + phase * 2)
        rgb = rgb + (curtain * streak)[..., None] * cols[2 + k % 3] * 0.5
    return rgb * vignette(x, y, 0.35)

def cross_scene(w, h, pal, rng, sun=0.0):
    x, y = grid(w, h)
    cols = [hex2rgb(c) for c in pal]
    sky = cols[3] * (1 - y[..., None]) + cols[2] * (y[..., None] ** 2) * 0.9
    sx, sy = 0.5, 0.7 - sun * 0.02
    glow = np.exp(-(((x - sx) * 1.78) ** 2 + (y - sy) ** 2) / 0.05)[..., None]
    rgb = sky + glow * cols[4] * 0.9
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    hill = [(0, h)] + [(i, h * (0.78 - 0.12 * math.exp(-((i / w - 0.5) ** 2) / 0.05) + 0.015 * math.sin(i / w * 9))) for i in range(0, w + 1, max(1, w // 200))] + [(w, h)]
    dark = tuple(int(v * 255 * 0.25) for v in cols[0])
    d.polygon(hill, fill=dark)
    cx, top = w * 0.5, h * 0.36
    bw, armw = w * 0.012, w * 0.075
    d.rectangle([cx - bw, top, cx + bw, h * 0.68], fill=dark)
    d.rectangle([cx - armw, top + h * 0.075, cx + armw, top + h * 0.075 + bw * 2], fill=dark)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(w / 3000)), np.float32) / 255

def lowpoly(w, h, pal, rng):
    cols = [hex2rgb(c) for c in pal]
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    nx, ny = 16, 9
    pts = [[(i / nx * w + (rng.random() - 0.5) * w / nx * 0.8 * (0 < i < nx), j / ny * h + (rng.random() - 0.5) * h / ny * 0.8 * (0 < j < ny)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            a, b, c, e = pts[j][i], pts[j][i + 1], pts[j + 1][i], pts[j + 1][i + 1]
            for tri in ((a, b, c), (b, e, c)):
                cx = sum(p[0] for p in tri) / 3 / w
                cy = sum(p[1] for p in tri) / 3 / h
                t = np.clip(0.5 * cx + 0.5 * cy + (rng.random() - 0.5) * 0.15, 0, 1)
                col = cols[1] * (1 - t) + cols[3] * t + cols[2] * 0.25 * math.exp(-((cx - 0.3) ** 2 + (cy - 0.3) ** 2) / 0.08)
                d.polygon(tri, fill=tuple(int(min(1, v) * 255) for v in col))
    x, y = grid(w, h)
    return np.asarray(img, np.float32) / 255 * vignette(x, y, 0.5)

IMAGES = [
    # (name, title, category, maker)
    *[(f"glow-{p}", f"Soft glow – {p.replace('-', ' ').title()}", "Soft colour", lambda w, h, r, p=p: mesh(w, h, PALETTES[p], r)) for p in
      ["teal-dawn", "royal", "gold", "ocean", "rose", "forest", "crimson", "sunrise", "mint", "midnight"]],
    *[(f"bokeh-{p}", f"Bokeh lights – {p.replace('-', ' ').title()}", "Bokeh", lambda w, h, r, p=p: bokeh_layer(mesh(w, h, PALETTES[p], r) * 0.6, w, h, PALETTES[p], r, 70)) for p in ["gold", "teal-dawn", "royal", "rose"]],
    *[(f"rays-{p}", f"Light from above – {p.replace('-', ' ').title()}", "Light rays", lambda w, h, r, p=p: rays(w, h, PALETTES[p], r)) for p in ["gold", "ocean", "royal"]],
    *[(f"stars-{p}", f"Starry night – {p.replace('-', ' ').title()}", "Night sky", lambda w, h, r, p=p: stars(w, h, PALETTES[p], r)) for p in ["royal", "ocean", "midnight"]],
    *[(f"waves-{p}", f"Flowing waves – {p.replace('-', ' ').title()}", "Waves", lambda w, h, r, p=p: waves(w, h, PALETTES[p], r)) for p in ["teal-dawn", "royal", "gold"]],
    *[(f"aurora-{p}", f"Aurora – {p.replace('-', ' ').title()}", "Aurora", lambda w, h, r, p=p: aurora(w, h, PALETTES[p], r)) for p in ["forest", "mint", "royal"]],
    *[(f"cross-{p}", f"The cross – {p.replace('-', ' ').title()}", "The cross", lambda w, h, r, p=p: cross_scene(w, h, PALETTES[p], r)) for p in ["sunrise", "gold", "ocean"]],
    *[(f"facets-{p}", f"Facets – {p.replace('-', ' ').title()}", "Geometric", lambda w, h, r, p=p: lowpoly(w, h, PALETTES[p], r)) for p in ["teal-dawn", "royal", "midnight"]],
]

# ---------------------------------------------------------------- motion loops (every motion is periodic over FRAMES)
def v_mesh(p):
    pal = PALETTES[p]
    rng = np.random.default_rng(hash(p) % 2**32)
    base = [(rng.random(), rng.random(), 0.25 + rng.random() * 0.3, rng.random() * TAU, 0.08 + rng.random() * 0.12, 1 + rng.integers(0, 2)) for _ in range(5)]
    def frame(f):
        t = f / FRAMES * TAU
        pts = [(cx + rr * math.cos(t * k + ph), cy + rr * 0.7 * math.sin(t * k + ph), r) for cx, cy, r, ph, rr, k in base]
        return mesh(VW, VH, pal, rng, pts)
    return frame

def v_bokeh(p, n=55, rise=1):
    pal = PALETTES[p]
    rng = np.random.default_rng(hash(p) % 2**32 + 1)
    bg = mesh(VW, VH, pal, rng) * 0.55
    parts = [(rng.random() * VW, rng.random(), (0.015 + rng.random() ** 2 * 0.06) * VW, 0.25 + rng.random() * 0.6, rng.random() * TAU, 1 + rng.integers(0, 2)) for _ in range(n)]
    def frame(f):
        t = f / FRAMES
        pos = []
        for x0, y0, r, a, ph, k in parts:
            y = ((y0 - t * rise * k) % 1.0) * (VH + 4 * r) - 2 * r
            x = x0 + math.sin(t * TAU + ph) * 12
            pos.append((x, y, r, a * (0.75 + 0.25 * math.sin(t * TAU * 2 + ph))))
        return bokeh_layer(bg, VW, VH, pal, rng, n, positions=pos)
    return frame

def v_rays(p):
    pal = PALETTES[p]
    rng = np.random.default_rng(3)
    n1, n2 = smooth_noise(VW, VH, 4, rng, 3), smooth_noise(VW, VH, 4, rng, 3)
    def frame(f):
        t = f / FRAMES * TAU
        mix = 0.5 + 0.5 * math.cos(t)
        return rays(VW, VH, pal, rng, phase=math.sin(t) * 0.6, noise=n1 * mix + n2 * (1 - mix))
    return frame

def v_stars(p):
    pal = PALETTES[p]
    rng = np.random.default_rng(5)
    a, b = smooth_noise(VW, VH, 3, rng, 5), smooth_noise(VW, VH, 3, rng, 5)
    def frame(f):
        t = f / FRAMES * TAU
        mix = 0.5 + 0.5 * math.cos(t)
        return stars(VW, VH, pal, rng, n=900, twinkle=t * 3, nebula=a * mix + b * (1 - mix))
    return frame

def v_waves(p):
    pal = PALETTES[p]
    return lambda f: waves(VW, VH, pal, None, phase=f / FRAMES * TAU)

def v_aurora(p):
    pal = PALETTES[p]
    return lambda f: aurora(VW, VH, pal, None, phase=f / FRAMES * TAU)

def v_cross(p):
    pal = PALETTES[p]
    rng = np.random.default_rng(9)
    still = cross_scene(VW, VH, pal, rng)
    dust = [(rng.random() * VW, rng.random(), 1.2 + rng.random() * 2.5, 0.3 + rng.random() * 0.5, rng.random() * TAU) for _ in range(70)]
    def frame(f):
        t = f / FRAMES
        img = Image.fromarray((np.clip(still * (0.94 + 0.06 * math.sin(t * TAU)), 0, 1) * 255).astype(np.uint8)).convert("RGBA")
        layer = Image.new("RGBA", (VW, VH), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x0, y0, r, a, ph in dust:
            y = ((y0 - t) % 1.0) * VH
            x = x0 + math.sin(t * TAU * 2 + ph) * 10
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 230, 170, int(255 * a)))
        layer = layer.filter(ImageFilter.GaussianBlur(1.2))
        return np.asarray(Image.alpha_composite(img, layer).convert("RGB"), np.float32) / 255
    return frame

VIDEOS = [
    ("loop-glow-teal", "Moving glow – Teal", "Soft colour", lambda: v_mesh("teal-dawn")),
    ("loop-glow-royal", "Moving glow – Royal", "Soft colour", lambda: v_mesh("royal")),
    ("loop-glow-sunrise", "Moving glow – Sunrise", "Soft colour", lambda: v_mesh("sunrise")),
    ("loop-glow-ocean", "Moving glow – Ocean", "Soft colour", lambda: v_mesh("ocean")),
    ("loop-bokeh-gold", "Rising lights – Gold", "Bokeh", lambda: v_bokeh("gold")),
    ("loop-bokeh-teal", "Rising lights – Teal", "Bokeh", lambda: v_bokeh("teal-dawn")),
    ("loop-bokeh-rose", "Rising lights – Rose", "Bokeh", lambda: v_bokeh("rose")),
    ("loop-rays-gold", "Light from above – Gold", "Light rays", lambda: v_rays("gold")),
    ("loop-rays-ocean", "Light from above – Ocean", "Light rays", lambda: v_rays("ocean")),
    ("loop-stars-royal", "Starry night – Royal", "Night sky", lambda: v_stars("royal")),
    ("loop-waves-teal", "Flowing waves – Teal", "Waves", lambda: v_waves("teal-dawn")),
    ("loop-waves-royal", "Flowing waves – Royal", "Waves", lambda: v_waves("royal")),
    ("loop-aurora-forest", "Aurora – Green", "Aurora", lambda: v_aurora("forest")),
    ("loop-cross-sunrise", "The cross at sunrise", "The cross", lambda: v_cross("sunrise")),
]

# ---------------------------------------------------------------- output
def make_image(args):
    out, name, title, cat, idx = args
    maker = IMAGES[idx][3]
    rng = np.random.default_rng(abs(hash(name)) % 2**32)
    img = to_img(maker(W4, H4, rng), 0.01, rng)
    path = os.path.join(out, "images", name + ".jpg")
    img.save(path, quality=92, subsampling=0, optimize=True)
    img.resize((1920, 1080), Image.LANCZOS).save(os.path.join(out, "hd", name + ".jpg"), quality=90, optimize=True)
    img.resize((480, 270), Image.LANCZOS).save(os.path.join(out, "thumbs", name + ".jpg"), quality=82)
    return {"id": name, "title": title, "category": cat, "kind": "image", "file": f"images/{name}.jpg", "thumb": f"thumbs/{name}.jpg",
            "width": W4, "height": H4, "bytes": os.path.getsize(path)}

def make_video(args):
    out, name, title, cat, idx = args
    frame = VIDEOS[idx][3]()
    path = os.path.join(out, "videos", name + ".mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{VW}x{VH}", "-r", str(FPS), "-i", "-",
                           "-vf", "scale=1920:1080:flags=lanczos,noise=alls=2:allf=t,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "19",
                           "-g", "60", "-movflags", "+faststart", "-an", path], stdin=subprocess.PIPE)
    for f in range(FRAMES):
        ff.stdin.write((np.clip(frame(f), 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    ff.stdin.close()
    ff.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "3", "-i", path, "-frames:v", "1", "-vf", "scale=480:270", "-q:v", "4",
                    os.path.join(out, "thumbs", name + ".jpg")], check=True)
    return {"id": name, "title": title, "category": cat, "kind": "video", "file": f"videos/{name}.mp4", "thumb": f"thumbs/{name}.jpg",
            "width": 1920, "height": 1080, "seconds": SECONDS, "bytes": os.path.getsize(path)}

def main():
    out = os.path.abspath(sys.argv[1])
    what = sys.argv[2] if len(sys.argv) > 2 else "all"
    only = sys.argv[3] if len(sys.argv) > 3 else None
    for d in ("images", "videos", "thumbs", "hd"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    man_path = os.path.join(out, "manifest.json")
    items = {i["id"]: i for i in json.load(open(man_path))["items"]} if os.path.exists(man_path) else {}
    jobs = []
    if what in ("images", "all"):
        jobs += [(make_image, (out, n, t, c, i)) for i, (n, t, c, _) in enumerate(IMAGES) if not only or only == n]
    if what in ("videos", "all"):
        jobs += [(make_video, (out, n, t, c, i)) for i, (n, t, c, _) in enumerate(VIDEOS) if not only or only == n]
    workers = max(1, min(len(jobs), (os.cpu_count() or 4) - 1))
    with ProcessPoolExecutor(workers) as ex:
        futs = [ex.submit(fn, a) for fn, a in jobs]
        for fu in futs:
            r = fu.result()
            items[r["id"]] = r
            print("done", r["id"], r["bytes"] // 1024, "KB", flush=True)
    order = [n for n, *_ in IMAGES] + [n for n, *_ in VIDEOS]
    ordered = [items[k] for k in order if k in items]
    json.dump({"version": 1, "credit": "Original backgrounds made by WorshipHQ. Free for churches using WorshipHQ Media.", "items": ordered},
              open(man_path, "w"), indent=1)

if __name__ == "__main__":
    main()
