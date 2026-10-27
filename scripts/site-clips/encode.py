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
    'plan': [(7.29, 10.29), (12.4, 13.5), (14.59, 16.59), (17.69, 19.99), (21.29, 23.09)],
    'reader': [(9.73, 13.13), (16.23, 19.73), (20.83, 25.53), (27.13, 28.13), (29.48, 33.93)],
    'carry': [(14.27, 20.07)],
    'activity': [(6.19, 9.03), (10.33, 12.63), (13.58, 15.98), (17.08, 19.06), (19.64, 22.33)],
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
