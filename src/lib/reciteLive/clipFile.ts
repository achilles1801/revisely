// A moment of the take as a WAV file in the caches folder, for "Your recitation" to play (lib/reciteLive/hearAudio).
// One file, written again each time: nothing piles up, and it stays on this phone.

import { File, Paths } from 'expo-file-system';
import { pcmBytes, wavHeader } from '../reciteCheck/wav';

/** Write `pcm` (16 kHz mono) as a WAV file; its uri. */
export function writeClip(pcm: Int16Array): string {
  const file = new File(Paths.cache, 'recite-your-recitation.wav');
  if (file.exists) file.delete();
  file.create();
  const data = pcmBytes([pcm]);
  const bytes = new Uint8Array(44 + data.length);
  bytes.set(wavHeader(data.length), 0);
  bytes.set(data, 44);
  file.write(bytes);
  return file.uri;
}
