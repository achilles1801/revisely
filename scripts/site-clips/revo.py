"""Make the website's Revo clip, in light and dark, from the app's recording of the Revo moment.

    python3 scripts/site-clips/revo.py --light <video or frames dir> --dark <video or frames dir> [--hold 2.5]

The input is the What's new "Revo moment" as the app plays it, recorded on a simulator, once in light
and once in dark. Each input is a video file, or a folder of frames named f0000.png, f0001.png, ... at
30 fps. Writes docs/assets/clips/revo-light.{mp4,webm,jpg} and revo-dark.{mp4,webm,jpg}: H.264 and
VP9 at 600 px wide (twice the phone frame on the page), muted, and a poster of the last frame, the
"Meet Revo" card. That poster is what a visitor with Reduce Motion sees until they press play.

--hold freezes the last frame for that many seconds before the clip loops, so the card can be read.
The recording should show the status bar and the Dynamic Island, as the other clips do.
"""
import argparse
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'assets', 'clips')
WIDTH = 600
FPS = 30
SCREEN = 1320 / 2868  # the page's .screen aspect ratio; other sizes are cropped to it (object-fit: cover)


def run(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def probe_size(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    w, h = out.split(',')[:2]
    return int(w), int(h)


def source(path):
    """ffmpeg input arguments and the first frame's path (for its size)."""
    if os.path.isdir(path):
        return ['-framerate', str(FPS), '-i', os.path.join(path, 'f%04d.png')], os.path.join(path, 'f0000.png')
    return ['-i', path], path


def filters(hold):
    f = [f'fps={FPS}', f'scale={WIDTH}:-2:flags=lanczos']
    if hold:
        f.append(f'tpad=stop_mode=clone:stop_duration={hold}')
    f.append('format=yuv420p')
    return ','.join(f)


def encode(name, path, hold):
    args, first = source(path)
    w, h = probe_size(first)
    if abs(w / h - SCREEN) > 0.01:
        print(f'{name}: {w}x{h} is not the page\'s screen shape; the page crops it to fit')
    mp4, webm, jpg = (os.path.join(OUT, f'revo-{name}.{ext}') for ext in ('mp4', 'webm', 'jpg'))
    run(*args, '-vf', filters(hold), '-an',
        '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-tune', 'animation',
        '-profile:v', 'high', '-g', '60', '-movflags', '+faststart', mp4)
    run('-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1',
        '-deadline', 'good', '-cpu-used', '2', webm)
    # The poster is the last frame, taken from the input rather than the compressed clip.
    if os.path.isdir(path):
        last = sorted(f for f in os.listdir(path) if f.startswith('f') and f.endswith('.png'))[-1]
        run('-i', os.path.join(path, last), '-vf', filters(0), '-q:v', '4', jpg)
    else:
        run('-sseof', '-0.3', '-i', path, '-vf', filters(0), '-update', '1', '-q:v', '4', jpg)
    kb = {p.rsplit('.', 1)[1]: os.path.getsize(p) // 1024 for p in (mp4, webm, jpg)}
    print(name, kb)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--light', required=True)
    ap.add_argument('--dark', required=True)
    ap.add_argument('--hold', type=float, default=0, help='seconds to hold the last frame before the loop')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    encode('light', a.light, a.hold)
    encode('dark', a.dark, a.hold)


if __name__ == '__main__':
    main()
