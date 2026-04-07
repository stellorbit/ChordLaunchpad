import type { BassAdditionMode, ChordBlock, OpenVoicingMode, TimeSignature } from "../types/music";
import { chordDurationBeats, midiNoteNumbers } from "./music";

const TICKS_PER_BEAT = 480;

function pushUint32(bytes: number[], value: number): void {
  bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function pushUint16(bytes: number[], value: number): void {
  bytes.push((value >> 8) & 0xff, value & 0xff);
}

function varLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

function pushMetaEvent(track: number[], delta: number, type: number, data: number[]): void {
  track.push(...varLen(delta), 0xff, type, ...varLen(data.length), ...data);
}

function pushMidiEvent(track: number[], delta: number, status: number, data1: number, data2: number): void {
  track.push(...varLen(delta), status, data1, data2);
}

export function buildMidiFile(
  chords: ChordBlock[],
  bpm: number,
  timeSignature: TimeSignature,
  options: { bassAddition?: BassAdditionMode; openVoicing?: OpenVoicingMode } = {},
): Uint8Array {
  const bytes: number[] = [];
  const track: number[] = [];

  bytes.push(0x4d, 0x54, 0x68, 0x64);
  pushUint32(bytes, 6);
  pushUint16(bytes, 0);
  pushUint16(bytes, 1);
  pushUint16(bytes, TICKS_PER_BEAT);

  const microsecondsPerBeat = Math.round(60000000 / bpm);
  pushMetaEvent(track, 0, 0x51, [
    (microsecondsPerBeat >> 16) & 0xff,
    (microsecondsPerBeat >> 8) & 0xff,
    microsecondsPerBeat & 0xff,
  ]);

  const numerator = Number(timeSignature.split("/")[0]);
  const denominator = Number(timeSignature.split("/")[1]);
  const denominatorPower = Math.log2(denominator);
  pushMetaEvent(track, 0, 0x58, [numerator, denominatorPower, 24, 8]);

  for (const chord of chords) {
    const notes = midiNoteNumbers(chord, options);
    const durationTicks = chordDurationBeats(chord.duration, timeSignature) * TICKS_PER_BEAT;

    notes.forEach((note, index) => {
      pushMidiEvent(track, index === 0 ? 0 : 0, 0x90, note, 92);
    });

    notes.forEach((note, index) => {
      pushMidiEvent(track, index === 0 ? durationTicks : 0, 0x80, note, 0);
    });
  }

  pushMetaEvent(track, 0, 0x2f, []);

  bytes.push(0x4d, 0x54, 0x72, 0x6b);
  pushUint32(bytes, track.length);
  bytes.push(...track);

  return new Uint8Array(bytes);
}
