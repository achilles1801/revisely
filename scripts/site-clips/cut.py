"""Cut a raw simulator take into a website loop.

    python3 cut.py <raw.mp4> <out dir> <name> [--start S] [--end E] [--hold 1.5] [--fade 0.5] [--poster T]
                   [--keep A-B ...] [--drop A-B ...] [--vp9-crf 38]

simctl writes a frame only when the screen changes, so a gap between frames is the app standing still
(usually Maestro waiting). Every still stretch longer than --hold is shortened to --hold; --keep A-B
keeps a stretch whole. The end cross-fades into the first frame so the loop has no seam. Writes
<name>.mp4 (H.264), <name>.webm (VP9) and <name>.jpg (poster at --poster seconds of the cut clip,
default the last frame before the fade), 600 px wide, 30 fps.
"""
import argparse
import json
import re
import os
import subprocess
import tempfile

WIDTH, FPS = 600, 30
SCALE = f'scale={WIDTH}:-2:flags=lanczos,setsar=1'
H264 = ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', '27', '-tune', 'animation',
        '-profile:v', 'high', '-g', '60', '-movflags', '+faststart', '-pix_fmt', 'yuv420p']
VP9 = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
       '-pix_fmt', 'yuv420p']


def run(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], check=True)


def frame_times(path):
    """Each frame's presentation time as ffprobe reads it. simctl's files repeat a timestamp now and then,
    after which ffmpeg's own decoding falls back to decode times and squashes the still stretches."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time',
                          '-of', 'csv=p=0', path], check=True, capture_output=True, text=True).stdout
    return [float(x.strip(',')) for x in out.split() if x.strip(',')]


def cfr_of(raw):
    """The take at a steady 30 fps and 600 px, cached next to it: every later time is in this timeline.
    Built from the frames in decode order, each shown until ffprobe's time for the next one."""
    cfr = raw.rsplit('.', 1)[0] + '.cfr.mkv'
    if os.path.exists(cfr) and os.path.getmtime(cfr) >= os.path.getmtime(raw):
        return cfr
    times = frame_times(raw)
    with tempfile.TemporaryDirectory() as tmp:
        run('-v', 'fatal', '-i', raw, '-fps_mode', 'passthrough', '-vf', SCALE, os.path.join(tmp, '%06d.png'))
        files = sorted(f for f in os.listdir(tmp) if f.endswith('.png'))
        n = min(len(files), len(times))
        if len(files) != len(times):
            print(f'warning: {len(files)} frames decoded, {len(times)} timestamps')
        lines = ['ffconcat version 1.0']
        for i in range(n):
            nxt = times[i + 1] if i + 1 < n else times[i] + 0.5
            lines += [f"file '{os.path.join(tmp, files[i])}'", f'duration {max(nxt - times[i], 0.0005):.6f}']
        lines.append(f"file '{os.path.join(tmp, files[n - 1])}'")
        lst = os.path.join(tmp, 'list.ffconcat')
        open(lst, 'w').write('\n'.join(lines) + '\n')
        run('-f', 'concat', '-safe', '0', '-i', lst, '-vf', f'fps={FPS},format=yuv420p', '-c:v', 'libx264',
            '-preset', 'veryfast', '-crf', '8', cfr)
    return cfr


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                check=True, capture_output=True, text=True).stdout)


def freezes(cfr, hold):
    """Still stretches at least `hold` long, as (start, end)."""
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', cfr, '-vf', f'freezedetect=n=-55dB:d={hold}', '-an', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'freeze_start: ([0-9.]+)', err)]
    ends = [float(x) for x in re.findall(r'freeze_end: ([0-9.]+)', err)]
    ends += [duration(cfr)] * (len(starts) - len(ends))
    return list(zip(starts, ends))


def segments(still, start, end, hold, keep):
    segs, a = [], start
    for fs, fe in still:
        if fe <= start or fs >= end or any(k0 <= fs and fe <= k1 for k0, k1 in keep):
            continue
        fs = max(fs, start)
        if fe - fs > hold:
            segs.append((a, fs + hold))
            a = fe
    if a < end:
        segs.append((a, end))
    return [(s, e) for s, e in segs if e - s > 0.04]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('raw'); ap.add_argument('out'); ap.add_argument('name')
    ap.add_argument('--start', type=float, default=0); ap.add_argument('--end', type=float, default=1e9)
    ap.add_argument('--hold', type=float, default=1.5); ap.add_argument('--fade', type=float, default=0.5)
    ap.add_argument('--poster', type=float); ap.add_argument('--keep', action='append', default=[])
    ap.add_argument('--drop', action='append', default=[], help='A-B: leave this stretch out (30 fps timeline)')
    ap.add_argument('--vp9-crf', type=int, default=38, help='higher is smaller; raise it if the WebM outweighs the MP4')
    a = ap.parse_args()
    keep = [tuple(float(v) for v in k.split('-')) for k in a.keep]
    cfr = cfr_of(a.raw)
    end = min(a.end, duration(cfr))
    segs = segments(freezes(cfr, a.hold), a.start, end, a.hold, keep)
    for d0, d1 in (tuple(float(v) for v in d.split('-')) for d in a.drop):
        segs = [p for s, e in segs for p in ((s, min(e, d0)), (max(s, d1), e)) if p[1] - p[0] > 0.04]
    os.makedirs(a.out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        cuts = ';'.join(f'[0:v]trim={s:.3f}:{e:.3f},setpts=PTS-STARTPTS[s{i}]' for i, (s, e) in enumerate(segs))
        joined = ''.join(f'[s{i}]' for i in range(len(segs)))
        cut = os.path.join(tmp, 'cut.mkv')
        run('-i', cfr, '-filter_complex', f'{cuts};{joined}concat=n={len(segs)}:v=1:a=0[v]', '-map', '[v]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', cut)
        dur = duration(cut)
        first = os.path.join(tmp, 'first.png')
        run('-i', cut, '-frames:v', '1', first)
        jpg = os.path.join(a.out, f'{a.name}.jpg')
        pt = a.poster if a.poster is not None else max(0, dur - 0.1)
        run('-ss', f'{pt:.3f}', '-i', cut, '-frames:v', '1', '-q:v', '4', jpg)
        if a.fade:
            inputs = ['-i', cut, '-loop', '1', '-framerate', str(FPS), '-t', str(a.fade), '-i', first]
            graph = (f'[0:v]settb=AVTB,format=yuv420p[a];[1:v]settb=AVTB,format=yuv420p[b];'
                     f'[a][b]xfade=transition=fade:duration={a.fade}:offset={dur - a.fade:.3f},format=yuv420p[v]')
        else:
            inputs, graph = ['-i', cut], '[0:v]format=yuv420p[v]'
        for ext, codec in (('mp4', H264), ('webm', VP9 + ['-crf', str(a.vp9_crf)])):
            run(*inputs, '-filter_complex', graph, '-map', '[v]', '-an', *codec, os.path.join(a.out, f'{a.name}.{ext}'))
    sizes = {e: os.path.getsize(os.path.join(a.out, f'{a.name}.{e}')) // 1024 for e in ('mp4', 'webm', 'jpg')}
    print(json.dumps({'name': a.name, 'seconds': round(dur, 2), 'segments': len(segs), 'kb': sizes}))


if __name__ == '__main__':
    main()
