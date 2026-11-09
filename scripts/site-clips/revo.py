"""Make the website's Revo clip, in light and dark, from the app's recording of the Revo moment.

    python3 scripts/site-clips/revo.py --light <video> --dark <video> [--hold 1.5] [--fade 0.6] [--poster 4.8]

The input is the What's new "Revo moment" as the app plays it, recorded on a simulator, once in light
and once in dark, ending on the settled "Meet Revo" card with no loop fade (the 1320x2868 recordings in
~/Documents/revisely-today-mocks/whats-new/revo-intro/video/). Writes
docs/assets/clips/revo-light.{mp4,webm,jpg} and revo-dark.{mp4,webm,jpg}: H.264 and VP9 at 600 px wide
and 30 fps (like the page's other clips), muted, and a poster.

--hold keeps the last frame on screen that many seconds longer, so the card can be read.
--fade then cross-fades the end into the first frame, so the loop has no seam (0 for none).
--poster is the time, in seconds of the recording, of the poster frame (default: its last frame). The
poster shows until the clip plays, and it is all a visitor with Reduce Motion sees until they press play.
"""
import argparse
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'docs', 'assets', 'clips')
WIDTH = 600
FPS = 30
SCREEN = 1320 / 2868  # the page's .screen aspect ratio; other sizes are cropped to it (object-fit: cover)
SCALE = f'scale={WIDTH}:-2:flags=lanczos,setsar=1'

H264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-tune', 'animation',
        '-profile:v', 'high', '-g', '60', '-movflags', '+faststart']
VP9 = ['-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2']


def run(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def probe(path, entries):
    return subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', path],
        check=True, capture_output=True, text=True,
    ).stdout.strip()


def encode(name, path, hold, fade, poster):
    w, h = (int(x) for x in probe(path, 'stream=width,height').split(',')[:2])
    if abs(w / h - SCREEN) > 0.01:
        print(f'{name}: {w}x{h} is not the page\'s screen shape; the page crops it to fit')
    duration = float(probe(path, 'format=duration'))
    mp4, webm, jpg = (os.path.join(OUT, f'revo-{name}.{ext}') for ext in ('mp4', 'webm', 'jpg'))

    with tempfile.TemporaryDirectory() as tmp:
        main = f'[0:v]fps={FPS},{SCALE},tpad=stop_mode=clone:stop_duration={hold},format=yuv420p,settb=AVTB'
        if fade:
            first = os.path.join(tmp, 'first.png')
            run('-i', path, '-frames:v', '1', first)
            inputs = ['-i', path, '-loop', '1', '-framerate', str(FPS), '-t', str(fade), '-i', first]
            graph = (f'{main}[a];[1:v]fps={FPS},{SCALE},format=yuv420p,settb=AVTB[b];'
                     f'[a][b]xfade=transition=fade:duration={fade}:offset={duration + hold - fade:.3f},format=yuv420p[v]')
        else:
            inputs = ['-i', path]
            graph = f'{main}[v]'
        for out, codec in ((mp4, H264), (webm, VP9)):
            run(*inputs, '-filter_complex', graph, '-map', '[v]', '-an', *codec, out)

    # The poster comes from the recording, not the compressed clip.
    at = ['-ss', str(poster)] if poster is not None else ['-sseof', '-0.1']
    run(*at, '-i', path, '-vf', SCALE, '-update', '1', '-frames:v', '1', '-q:v', '4', jpg)
    kb = {p.rsplit('.', 1)[1]: os.path.getsize(p) // 1024 for p in (mp4, webm, jpg)}
    print(name, f'{duration + hold:.1f} s', kb)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--light', required=True)
    ap.add_argument('--dark', required=True)
    ap.add_argument('--hold', type=float, default=0, help='seconds to keep the last frame on screen longer')
    ap.add_argument('--fade', type=float, default=0.6, help='seconds of cross-fade from the end into the first frame')
    ap.add_argument('--poster', type=float, help='time in the recording of the poster frame (default: the last frame)')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    encode('light', a.light, a.hold, a.fade, a.poster)
    encode('dark', a.dark, a.hold, a.fade, a.poster)


if __name__ == '__main__':
    main()
