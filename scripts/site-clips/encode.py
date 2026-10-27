"""Cut the raw simulator recordings into the website's clips.

    python3 scripts/site-clips/encode.py <dir with raw-<name>.mp4> docs/assets/clips

Each clip keeps only the listed (start, end) seconds of its raw take, which drops
the pauses between Maestro steps. The times fit the takes of 2026-10-27; a new
take needs new times (ffprobe -show_entries frame=pts_time lists when the
screen changed). Writes <name>.mp4 (H.264), <name>.webm (VP9) and <name>.jpg
(the poster, at POSTER seconds into the cut clip).
"""
import os
import subprocess
import sys

RAW, OUT = sys.argv[1], sys.argv[2]
WIDTH = 600  # 2x the phone frame's width on the page

CLIPS = {
    'plan': [(6.3, 9.3), (11.5, 12.6), (13.6, 15.6), (16.7, 19.0), (20.4, 22.2)],
    'reader': [(6.6, 10.0), (13.1, 16.6), (17.7, 22.4), (24.0, 25.0), (26.35, 30.8)],
    'carry': [(7.4, 13.2)],
    'activity': [(6.6, 9.4), (10.6, 12.9), (13.8, 16.2), (17.4, 19.4), (19.9, 22.6)],
}
POSTER = {'plan': 0.3, 'reader': 5.6, 'carry': 1.0, 'activity': 4.6}


def run(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


os.makedirs(OUT, exist_ok=True)
for name, segs in CLIPS.items():
    cuts = ';'.join(f'[0:v]fps=30,trim={a}:{b},setpts=PTS-STARTPTS[s{i}]' for i, (a, b) in enumerate(segs))
    joined = ''.join(f'[s{i}]' for i in range(len(segs)))
    graph = f'{cuts};{joined}concat=n={len(segs)}:v=1:a=0,scale={WIDTH}:-2:flags=lanczos,format=yuv420p[v]'
    mp4, webm, jpg = (f'{OUT}/{name}.{ext}' for ext in ('mp4', 'webm', 'jpg'))
    run('-i', f'{RAW}/raw-{name}.mp4', '-filter_complex', graph, '-map', '[v]', '-an',
        '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-tune', 'animation',
        '-profile:v', 'high', '-g', '60', '-movflags', '+faststart', mp4)
    run('-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1',
        '-deadline', 'good', '-cpu-used', '2', webm)
    run('-ss', str(POSTER[name]), '-i', mp4, '-frames:v', '1', '-q:v', '5', jpg)
    kb = {p.rsplit('.', 1)[1]: os.path.getsize(p) // 1024 for p in (mp4, webm, jpg)}
    print(name, kb)
