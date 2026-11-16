// The announcer's sound: raw text-to-speech in, an arcade announcer out (needs ffmpeg on the PATH).
//   punch: close-mic and loud: low rumble cut, boxiness out, presence up, squashed hard, a little tube grit, every
//          clip at the same loudness
//   arena: punch plus a short slapback, the big-room arcade-cabinet sound
// fx(input, output, preset, { game, level }) -> output; game: small mono MP3 for the page, else 128 kbps for auditions;
// level: dB from the usual loudness (-14 LUFS), e.g. -4 for a quieter line
import { execFileSync } from 'node:child_process';

const CHAIN = [
  'highpass=f=90',
  'equalizer=f=280:t=q:w=1.2:g=-3',          // boxiness out
  'equalizer=f=3000:t=q:w=1:g=4',            // presence
  'equalizer=f=9000:t=h:w=0.7:g=2',          // air
  'acompressor=threshold=0.06:ratio=6:attack=3:release=90:makeup=2',
  'volume=5dB', 'asoftclip=type=tanh',       // driven into a soft clipper: grit
];
const PRESETS = {
  raw: [],                                   // only levelled, so the comparison is fair (louder always sounds better)
  punch: [...CHAIN],
  arena: [...CHAIN, 'apad=pad_dur=0.25', 'aecho=0.9:0.55:60|125:0.25|0.12'],
};
export function fx(input, output, preset = 'arena', { game = false, level = 0 } = {}) {
  const af = [...PRESETS[preset], `loudnorm=I=${-14 + level}:TP=-1:LRA=7`].join(',');
  const enc = game ? ['-ac', '1', '-ar', '22050', '-b:a', '32k'] : ['-ac', '1', '-ar', '44100', '-b:a', '128k'];
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-af', af, ...enc, output]);
  return output;
}
export const FX = Object.keys(PRESETS); // raw, punch, arena
