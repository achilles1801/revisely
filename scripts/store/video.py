"""The store video: app footage, framed under a caption, or full screen for the Revo moment.

    python3 scripts/store/video.py <edit.json> <out.mp4> [--size 886x1920] [--keyframes <dir>]

edit.json lists shots in order. A shot is footage (a screen recording, `in`/`out` in seconds of it,
`speed`) or a still, with a caption (or none), `mode` "framed" or "full", and optional touch markers
(`touches`: [{"t": seconds into the shot, "x": 0..1, "y": 0..1}] on the app's screen). Shots cross-fade;
a change of mode grows or shrinks the screen across the cut. Frames are drawn with Pillow and piped to
ffmpeg: H.264 High, 30 fps, ~11 Mbps, with a silent stereo AAC track (App Store Connect's app preview
spec, checked Nov 2026: 886x1920, 15-30 s, <= 30 fps, 10-12 Mbps, stereo AAC 256 kbps at 48 kHz).
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import THEMES, font, wrap  # noqa: E402

FPS = 30
FADE = 0.3   # cross-fade between shots
GROW = 0.5   # framed <-> full


def ease(x):
    x = min(1.0, max(0.0, x))
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


class Layout:
    def __init__(self, W, H, theme='light', layout=None):
        self.W, self.H, self.t = W, H, THEMES[theme]
        s = W / 886
        self.s = s
        L = layout or {}  # measures in the 886-wide frame: cap, capTop, fw (screen width), fy (screen top)
        self.cap_font = font(int(L.get('cap', 62) * s), 700, 96)
        self.cap_top = int(L.get('capTop', 118) * s)
        # The framed screen: centred, under the caption (it may run off the bottom of a 9:16 frame).
        self.fw = int(L.get('fw', 690) * s)
        self.fy = int(L.get('fy', 372) * s)
        self.pill_size = L.get('pill', 44)  # full bleed: the caption pill's type size
        self.bg = self._background()

    def _background(self):
        W, H, t = self.W, self.H, self.t
        bg = Image.new('RGBA', (W, H), (*t['bg'], 255))
        col, top = t['glow'][0]
        gh = int(H * 0.45)
        layer = Image.new('RGBA', (1, gh))
        for y in range(gh):
            layer.putpixel((0, y), (*col, int(round(255 * top * (1 - y / gh) ** 2.8))))
        bg.alpha_composite(layer.resize((W, gh)), (0, 0))
        return bg

    def screen_rect(self, k, aspect):
        """The screen's box: k = 0 framed, 1 full screen (cover)."""
        W, H = self.W, self.H
        fw = self.fw
        fh = fw / aspect
        fx, fy = (W - fw) / 2, self.fy
        # full: cover the canvas, centred
        cw = max(W, H * aspect)
        ch = cw / aspect
        cx, cy = (W - cw) / 2, (H - ch) / 2
        k = ease(k)
        return (fx + (cx - fx) * k, fy + (cy - fy) * k, fw + (cw - fw) * k, fh + (ch - fh) * k)

    def frame(self, screen, caption, k, cap_alpha=1.0, touches=()):
        W, H, s = self.W, self.H, self.s
        out = self.bg.copy()
        d = ImageDraw.Draw(out)
        if caption and cap_alpha > 0 and k < 1:
            a = int(255 * cap_alpha * (1 - ease(k)))
            y = self.cap_top
            for line in wrap(d, caption, self.cap_font, W - int(90 * s)):
                txt = Image.new('RGBA', (W, int(self.cap_font.size * 1.4)))
                ImageDraw.Draw(txt).text((W / 2, 0), line, font=self.cap_font, fill=(*self.t['text'], 255), anchor='ma')
                txt.putalpha(Image.eval(txt.getchannel('A'), lambda v: v * a // 255))
                out.alpha_composite(txt, (0, y))
                y += int(self.cap_font.size * 1.14)
        aspect = screen.width / screen.height
        x, y, w, h = self.screen_rect(k, aspect)
        w_i, h_i = max(1, int(round(w))), max(1, int(round(h)))
        face = screen.convert('RGB').resize((w_i, h_i), Image.LANCZOS)
        radius = int(w_i * 0.125 * (1 - ease(k)))
        xi, yi = int(round(x)), int(round(y))
        if radius > 0:
            rim = max(1, int(3 * s))
            if self.t['shadow']:
                sh = Image.new('RGBA', (W, H))
                ImageDraw.Draw(sh).rounded_rectangle((xi, yi + int(14 * s), xi + w_i, yi + h_i + int(14 * s)), radius,
                                                     fill=(0x14, 0x10, 0x3C, int(255 * self.t['shadow'] * (1 - ease(k)))))
                out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(int(32 * s))))
            ImageDraw.Draw(out).rounded_rectangle((xi - rim, yi - rim, xi + w_i + rim - 1, yi + h_i + rim - 1), radius + rim,
                                                  fill=(*self.t['outline'], 255))
            mask = Image.new('L', (w_i, h_i), 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, w_i - 1, h_i - 1), radius, fill=255)
            out.paste(face, (xi, yi), mask)
        else:
            out.paste(face, (xi, yi))
        self._touches(out, touches, (xi, yi, w_i, h_i))
        return out.convert('RGB')

    def _touches(self, out, touches, box):
        W, H, s = self.W, self.H, self.s
        xi, yi, w_i, h_i = box
        for tx, ty, ta in touches:
            # A touch marker on the app's screen (App Review allows touch hotspots).
            px, py = xi + tx * w_i, yi + ty * h_i
            r = int(46 * s * (0.8 + 0.4 * (1 - ta)))
            m = Image.new('RGBA', (W, H))
            md = ImageDraw.Draw(m)
            md.ellipse((px - r, py - r, px + r, py + r), fill=(255, 255, 255, int(110 * ta)),
                       outline=(0x62, 0x4B, 0xD5, int(220 * ta)), width=max(2, int(5 * s)))
            out.alpha_composite(m)

    def bleed(self, screen, caption, sub, cap_alpha, touches, where='top', veil=0.0):
        """Full bleed: the app's screen fills the frame (no device, no frame) and the caption is a pill over it.
        At the top the pill covers the status bar's middle, where the Dynamic Island was."""
        W, H, s, t = self.W, self.H, self.s, self.t
        aspect = screen.width / screen.height
        x, y, w, h = self.screen_rect(1, aspect)
        w_i, h_i = int(round(w)), int(round(h))
        out = Image.new('RGBA', (W, H))
        out.paste(screen.convert('RGB').resize((w_i, h_i), Image.LANCZOS), (int(round(x)), int(round(y))))
        if veil:
            out.alpha_composite(Image.new('RGBA', (W, H), (*t['bg'], int(255 * veil))))
        self._touches(out, touches, (int(round(x)), int(round(y)), w_i, h_i))
        if caption and cap_alpha > 0:
            cf = font(int(self.pill_size * s), 700, 96)
            sf = font(int(30 * s), 500, 28)
            d = ImageDraw.Draw(out)
            lines = [(caption, cf, t['text'])] + ([(sub, sf, t['secondary'])] if sub else [])
            widths = [d.textlength(txt, font=f) for txt, f, _ in lines]
            heights = [int(f.size * 1.22) for _, f, _ in lines]
            pw = max(widths) + int(64 * s)
            ph = sum(heights) + int(30 * s)
            px = (W - pw) / 2
            py = int(24 * s) if where == 'top' else (H - ph) / 2
            pill = Image.new('RGBA', (W, H))
            pd = ImageDraw.Draw(pill)
            if t['shadow']:
                sh = Image.new('RGBA', (W, H))
                ImageDraw.Draw(sh).rounded_rectangle((px, py + 6 * s, px + pw, py + ph + 6 * s), ph / 2,
                                                     fill=(0x14, 0x10, 0x3C, int(60 * cap_alpha)))
                out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(int(14 * s))))
            pd.rounded_rectangle((px, py, px + pw, py + ph), min(ph / 2, 60 * s),
                                 fill=(*t['bg'], int(250 * cap_alpha)),
                                 outline=(*t['outline'], int(255 * cap_alpha)), width=max(1, int(2 * s)))
            yy = py + int(15 * s)
            for (txt, f, col), lh in zip(lines, heights):
                pd.text((W / 2, yy), txt, font=f, fill=(*col, int(255 * cap_alpha)), anchor='ma')
                yy += lh
            out.alpha_composite(pill)
        return out.convert('RGB')


class Footage:
    """Frames of a screen recording (or a still) at 30 fps: only a shot's in–out range, at the canvas's width.
    A shot's frames are dropped once the render has moved past it, so memory holds two shots at most."""
    cache = {}
    width = 1080

    @classmethod
    def frames(cls, src, start=0.0, end=None):
        key = (src, start, end)
        if key in cls.cache:
            return cls.cache[key]
        if src.lower().endswith(('.png', '.jpg')):
            cls.cache[key] = [Image.open(src).convert('RGB')]
            return cls.cache[key]
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                                     'stream=width,height', '-of', 'json', src]))['streams'][0]
        w, h = probe['width'], probe['height']
        sw = min(w // 2 * 2, cls.width // 2 * 2)
        sh = int(round(h * sw / w / 2) * 2)
        # Screen recordings are variable frame rate (a still screen writes no frames), so seeking before the input
        # lands on the last frame that changed. Put the file on a steady 30 fps timeline first, then cut by time.
        trim = f'trim=start={start:.3f}' + (f':end={end + 0.1:.3f}' if end is not None else '') + ',setpts=PTS-STARTPTS'
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-vf',
                                       f'fps={FPS},{trim},scale={sw}:{sh}:flags=lanczos', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
        n = len(raw) // (sw * sh * 3)
        cls.cache[key] = [Image.frombytes('RGB', (sw, sh), raw[i * sw * sh * 3:(i + 1) * sw * sh * 3]) for i in range(n)]
        return cls.cache[key]

    @classmethod
    def keep(cls, keys):
        for k in list(cls.cache):
            if k not in keys:
                del cls.cache[k]


def footage_key(shot, base):
    src = os.path.join(base, shot['src'])
    if src.lower().endswith(('.png', '.jpg')):
        return (src, 0.0, None)
    return (src, float(shot.get('in', 0)), float(shot['out']) if 'out' in shot else None)


def clean_bar(img, box):
    """Paints a status bar's notification icons with the bar's own ground ([x1, y1, x2, y2, sampleX], frame pixels)."""
    img = img.copy()
    x1, y1, x2, y2, sx = box
    px = img.load()
    for yy in range(y1, y2):
        c = px[sx, yy]
        for xx in range(x1, x2):
            px[xx, yy] = c
    return img


def paint_out(img, box):
    """Paints a box out of a frame (the Dynamic Island: [x1, y1, x2, y2] as fractions of the frame), each row
    filled from the colours just left and right of it, so the status bar's ground carries on under it."""
    img = img.copy()
    W, H = img.size
    x1, y1, x2, y2 = int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)
    px = img.load()
    for y in range(y1, y2):
        a, b = px[x1 - 1, y], px[x2, y]
        n = x2 - x1
        for x in range(x1, x2):
            k = (x - x1 + 0.5) / n
            px[x, y] = tuple(int(round(a[i] + (b[i] - a[i]) * k)) for i in range(3))
    return img


ISLAND = None  # the edit's `island` box, set by render()
CLEAR_BAR = None  # the edit's `clearBar`: the status bar's height as a fraction of the frame


def shot_frame(shot, local, base):
    key = footage_key(shot, base)
    frames = Footage.frames(*key)
    if len(frames) == 1:
        img = frames[0]
    else:
        t = local * shot.get('speed', 1)  # seconds after the shot's `in`
        if key[2] is not None:
            t = min(t, key[2] - key[1])  # a shot longer than its footage holds the last frame
        img = frames[min(len(frames) - 1, max(0, int(round(t * FPS))))]
    if shot.get('cleanBar'):
        img = clean_bar(img, shot['cleanBar'])
    if shot.get('crop'):
        # A box of the frame ([x1, y1, x2, y2] as fractions) that the shot shows, e.g. to leave out controls
        # store users never see (the tester replay's ✕ and Skip). Full bleed scales it back up to fill.
        x1, y1, x2, y2 = shot['crop']
        img = img.crop((int(x1 * img.width), int(y1 * img.height), int(x2 * img.width), int(y2 * img.height)))
    if ISLAND and shot.get('island', True):
        img = paint_out(img, ISLAND)
    if CLEAR_BAR and shot.get('caption') and len(frames) > 0:
        # Under a caption pill, the status bar's time and icons would peek out either side: clear the whole bar.
        img = paint_out(img, [2 / img.width, 0, 1 - 2 / img.width, CLEAR_BAR])
    return img


def durations(shots):
    return [s['dur'] if 'dur' in s else (s['out'] - s.get('in', 0)) / s.get('speed', 1) for s in shots]


def render(edit, out, size, keyframes=None):
    base = os.path.dirname(os.path.abspath(edit['_path']))
    shots = edit['shots']
    durs = durations(shots)
    starts = [sum(durs[:i]) for i in range(len(shots))]
    total = sum(durs)
    L = Layout(size[0], size[1], edit.get('theme', 'light'), edit.get('layout'))
    L.style = edit.get('style', 'framed')
    Footage.width = size[0]
    global ISLAND, CLEAR_BAR
    ISLAND = edit.get('island')
    CLEAR_BAR = edit.get('clearBar')
    W, H = size
    proc = None
    if out:
        proc = subprocess.Popen([
            'ffmpeg', '-y', '-v', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map', '0:v', '-map', '1:a', '-shortest',
            '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
            '-b:v', '11M', '-minrate', '11M', '-maxrate', '11M', '-bufsize', '11M', '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-r', str(FPS), '-g', str(FPS),
            '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
            '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    n = int(round(total * FPS))
    for i in range(n):
        t = i / FPS
        j = max(k for k in range(len(shots)) if starts[k] <= t + 1e-9)
        shot, local = shots[j], t - starts[j]
        Footage.keep({footage_key(shots[k], base) for k in (j - 1, j) if k >= 0})
        img = draw_shot(L, shot, local, durs[j], base, shots, j, starts)
        # Cross-fade into the next shot over its first FADE seconds (or the shot's own `fade` in seconds).
        fd = shot.get('fade', True)
        fd = FADE if fd is True else float(fd or 0)
        if j > 0 and local < fd and shots[j - 1].get('mode') == shot.get('mode'):
            prev = draw_shot(L, shots[j - 1], durs[j - 1] + local, durs[j - 1], base, shots, j - 1, starts)
            img = Image.blend(prev, img, local / fd)
        if proc:
            proc.stdin.write(img.tobytes())
        if keyframes is not None and abs(local - shot.get('key', durs[j] / 2)) < 0.5 / FPS:
            os.makedirs(keyframes, exist_ok=True)
            img.save(os.path.join(keyframes, f'{j + 1:02d}.png'))
    if proc:
        proc.stdin.close()
        proc.wait()
    return total


def draw_shot(L, shot, local, dur, base, shots, j, starts):
    screen = shot_frame(shot, min(local, dur - 1e-3), base)
    if getattr(L, 'style', 'framed') == 'bleed':
        prv = shots[j - 1] if j > 0 else None
        same = prv and prv.get('caption') == shot.get('caption') and prv.get('sub') == shot.get('sub')
        cap_alpha = 1.0 if same else min(1.0, local / 0.25)
        touches = []
        for tch in shot.get('touches', []):
            dt = local - tch['t']
            if -0.15 <= dt <= 0.45:
                touches.append((tch['x'], tch['y'], 1 - max(0.0, dt) / 0.45 if dt >= 0 else 1 + dt / 0.15))
        return L.bleed(screen, shot.get('caption'), shot.get('sub'), cap_alpha, touches,
                       shot.get('where', 'top'), shot.get('veil', 0.0))
    mode = shot.get('mode', 'framed')
    k = 1.0 if mode == 'full' else 0.0
    # Grow into a full-screen shot, shrink out of one, across the cut.
    nxt = shots[j + 1] if j + 1 < len(shots) else None
    prv = shots[j - 1] if j > 0 else None
    if mode == 'full' and prv and prv.get('mode', 'framed') != 'full' and local < GROW:
        k = local / GROW
    if mode != 'full' and prv and prv.get('mode') == 'full' and local < GROW:
        k = 1 - local / GROW
    cap_alpha = min(1.0, local / 0.25) if not (prv and prv.get('caption') == shot.get('caption')) else 1.0
    touches = []
    for tch in shot.get('touches', []):
        dt = local - tch['t']
        if -0.15 <= dt <= 0.45:
            touches.append((tch['x'], tch['y'], 1 - max(0.0, dt) / 0.45 if dt >= 0 else 1 + dt / 0.15))
    return L.frame(screen, shot.get('caption'), k, cap_alpha, touches)


if __name__ == '__main__':
    args = sys.argv[1:]
    edit = json.load(open(args[0]))
    edit['_path'] = args[0]
    out = args[1] if len(args) > 1 and not args[1].startswith('--') else None
    size = (886, 1920)
    kf = None
    if '--size' in args:
        size = tuple(int(v) for v in args[args.index('--size') + 1].split('x'))
    if '--keyframes' in args:
        kf = args[args.index('--keyframes') + 1]
    print('rendered', render(edit, out, size, kf), 's')
