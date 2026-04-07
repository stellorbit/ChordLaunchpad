import type {
  BassAdditionMode,
  ChordBlock,
  ChordDuration,
  ChordQuality,
  InputSlotsPerBar,
  MusicalMode,
  NotationPreference,
  OpenVoicingMode,
  ParseError,
  ParseResult,
  ProjectData,
  StylePreset,
  SuggestionItem,
  TimeSignature,
} from "../types/music";

const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_CANDIDATES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const DEGREE_OFFSETS_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_OFFSETS_MINOR = [0, 2, 3, 5, 7, 8, 10];
const ROMAN_TO_DEGREE: Record<string, number> = {
  i: 0,
  ii: 1,
  iii: 2,
  iv: 3,
  v: 4,
  vi: 5,
  vii: 6,
};
const DEGREE_LABELS_MAJOR = ["I", "ii", "iii", "IV", "V", "vi", "viidim"];
const DEGREE_LABELS_MINOR = ["i", "iidim", "III", "iv", "v", "VI", "VII"];

const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  rest: [],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  halfDiminished: [0, 3, 6, 10],
  augmented: [0, 4, 8],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  add9: [0, 4, 7, 14],
  minorAdd9: [0, 3, 7, 14],
  sus2: [0, 2, 7],
  sixth: [0, 4, 7, 9],
  minor6: [0, 3, 7, 9],
  sus4: [0, 5, 7],
};

const EXTENDED_DESCRIPTORS: Record<string, { quality: ChordQuality; intervals: number[]; descriptor: string }> = {
  dim7: { quality: "diminished", intervals: [0, 3, 6, 9], descriptor: "dim7" },
  "9": { quality: "dominant7", intervals: [0, 4, 7, 10, 14], descriptor: "9" },
  maj9: { quality: "major7", intervals: [0, 4, 7, 11, 14], descriptor: "maj9" },
  m9: { quality: "minor7", intervals: [0, 3, 7, 10, 14], descriptor: "m9" },
  "11": { quality: "dominant7", intervals: [0, 4, 7, 10, 14, 17], descriptor: "11" },
  m11: { quality: "minor7", intervals: [0, 3, 7, 10, 14, 17], descriptor: "m11" },
  "13": { quality: "dominant7", intervals: [0, 4, 7, 10, 14, 17, 21], descriptor: "13" },
  m13: { quality: "minor7", intervals: [0, 3, 7, 10, 14, 17, 21], descriptor: "m13" },
  add11: { quality: "major", intervals: [0, 4, 7, 17], descriptor: "add11" },
  madd11: { quality: "minor", intervals: [0, 3, 7, 17], descriptor: "madd11" },
  add13: { quality: "major", intervals: [0, 4, 7, 21], descriptor: "add13" },
  madd13: { quality: "minor", intervals: [0, 3, 7, 21], descriptor: "madd13" },
  "7sus4": { quality: "sus4", intervals: [0, 5, 7, 10], descriptor: "7sus4" },
  "7b9": { quality: "dominant7", intervals: [0, 4, 7, 10, 13], descriptor: "7b9" },
  "7#9": { quality: "dominant7", intervals: [0, 4, 7, 10, 15], descriptor: "7#9" },
  "7#11": { quality: "dominant7", intervals: [0, 4, 7, 10, 18], descriptor: "7#11" },
  "7b13": { quality: "dominant7", intervals: [0, 4, 7, 10, 20], descriptor: "7b13" },
  alt: { quality: "dominant7", intervals: [0, 4, 7, 10, 13, 15], descriptor: "alt" },
  "7alt": { quality: "dominant7", intervals: [0, 4, 7, 10, 13, 15], descriptor: "7alt" },
};

export const DEFAULT_PROJECT: ProjectData = {
  title: "Untitled Progression",
  key: "C",
  mode: "major",
  bpm: 120,
  timeSignature: "4/4",
  inputSlotsPerBar: 4,
  playbackTone: "piano",
  bassAddition: "none",
  openVoicing: "closed",
  chordDuration: "1 bar",
  style: "root",
  notationPreference: "roman",
  rawInput: "I V vi IV",
  chords: [],
};

function normalizeNote(note: string): string | null {
  const trimmed = note.trim();
  const match = trimmed.match(/^([A-Ga-g])([#b]?)$/);
  if (!match) return null;
  const normalized = `${match[1].toUpperCase()}${match[2] ?? ""}`;
  if (SHARP_NOTES.includes(normalized) || FLAT_NOTES.includes(normalized)) {
    return normalized;
  }
  return null;
}

function noteIndex(note: string): number {
  const normalized = normalizeNote(note);
  if (!normalized) return -1;
  const sharpIndex = SHARP_NOTES.indexOf(normalized);
  if (sharpIndex >= 0) return sharpIndex;
  return FLAT_NOTES.indexOf(normalized);
}

function noteAt(index: number, preferFlats = false): string {
  const normalizedIndex = ((index % 12) + 12) % 12;
  return preferFlats ? FLAT_NOTES[normalizedIndex] : SHARP_NOTES[normalizedIndex];
}

function preferFlatsForSignature(key: string, mode: MusicalMode): boolean {
  const flatMajorKeys = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]);
  const flatMinorKeys = new Set(["D", "G", "C", "F", "Bb", "Eb", "Ab"]);
  return mode === "major" ? flatMajorKeys.has(key) : flatMinorKeys.has(key);
}

function buildChordNotes(root: string, quality: ChordQuality): string[] {
  if (quality === "rest") return [];
  const base = noteIndex(root);
  const preferFlats = root.includes("b");
  return QUALITY_INTERVALS[quality].map((interval) => noteAt(base + interval, preferFlats));
}

function buildNotesFromIntervals(root: string, intervals: number[]): string[] {
  const base = noteIndex(root);
  const preferFlats = root.includes("b");
  return intervals.map((interval) => noteAt(base + interval, preferFlats));
}

function rotateNotes(notes: string[], inversion: StylePreset = "root"): string[] {
  if (notes.length <= 1 || inversion === "root") {
    return notes;
  }

  const steps = inversion === "1st" ? 1 : inversion === "2nd" ? 2 : 3;
  const safeSteps = Math.min(steps, Math.max(0, notes.length - 1));
  return [...notes.slice(safeSteps), ...notes.slice(0, safeSteps)];
}

function withBass(notes: string[], bass?: string): string[] {
  if (!bass || bass === notes[0]) {
    return notes;
  }
  return [bass, ...notes];
}

function relativeBass(root: string, bass?: string): number | null {
  if (!bass) return null;
  const rootIndex = noteIndex(root);
  const bassIndex = noteIndex(bass);
  if (rootIndex < 0 || bassIndex < 0) return null;
  return (bassIndex - rootIndex + 12) % 12;
}

function rebasedBass(nextRoot: string, originalRoot: string, originalBass?: string): string | undefined {
  const offset = relativeBass(originalRoot, originalBass);
  if (offset === null) return undefined;
  return noteAt(noteIndex(nextRoot) + offset, nextRoot.includes("b"));
}

function normalizeRomanToken(token: string): string {
  return token
    .replace(/maj7/gi, "")
    .replace(/m7b5/gi, "")
    .replace(/halfdim/gi, "")
    .replace(/min/gi, "")
    .replace(/m(?!aj)/gi, "")
    .replace(/add9/gi, "")
    .replace(/sus2/gi, "")
    .replace(/sus4/gi, "")
    .replace(/aug/gi, "")
    .replace(/6/gi, "")
    .replace(/9/gi, "")
    .replace(/7/g, "")
    .replace(/dim/gi, "")
    .replace(/ø/gi, "")
    .toLowerCase();
}

function romanDegree(token: string): number | null {
  const normalized = normalizeRomanToken(token);
  return normalized in ROMAN_TO_DEGREE ? ROMAN_TO_DEGREE[normalized] : null;
}

function romanQuality(token: string, mode: MusicalMode): ChordQuality {
  const hasSeven = token.includes("7");
  const lower = token.toLowerCase();
  const minorMarked = /^[iv]+m/.test(lower) || /^[iv]+min/.test(lower);
  if (lower.includes("maj7")) return "major7";
  if (lower.includes("ø") || lower.includes("m7b5") || lower.includes("halfdim")) return "halfDiminished";
  if (lower.includes("aug")) return "augmented";
  if (lower.includes("sus2")) return "sus2";
  if (lower.includes("sus4")) return "sus4";
  if (lower.includes("add9")) return minorMarked ? "minorAdd9" : "add9";
  if (lower.includes("6")) return minorMarked ? "minor6" : "sixth";
  if (lower.includes("dim") || lower.includes("vii")) return "diminished";
  if (hasSeven) {
    if (minorMarked) return "minor7";
    if (token === token.toUpperCase()) return "dominant7";
    return "minor7";
  }
  if (mode === "minor" && lower === "v") return "minor";
  if (minorMarked) return "minor";
  return token === token.toUpperCase() ? "major" : "minor";
}

function chordSymbol(root: string, quality: ChordQuality, descriptor?: string, bass?: string): string {
  if (quality === "rest") {
    return "R";
  }
  const suffix = bass ? `/${bass}` : "";
  if (descriptor) {
    return `${root}${descriptor}${suffix}`;
  }
  switch (quality) {
    case "minor":
      return `${root}m${suffix}`;
    case "diminished":
      return `${root}dim${suffix}`;
    case "halfDiminished":
      return `${root}m7b5${suffix}`;
    case "augmented":
      return `${root}aug${suffix}`;
    case "dominant7":
      return `${root}7${suffix}`;
    case "major7":
      return `${root}maj7${suffix}`;
    case "minor7":
      return `${root}m7${suffix}`;
    case "add9":
      return `${root}add9${suffix}`;
    case "minorAdd9":
      return `${root}madd9${suffix}`;
    case "sus2":
      return `${root}sus2${suffix}`;
    case "sixth":
      return `${root}6${suffix}`;
    case "minor6":
      return `${root}m6${suffix}`;
    case "sus4":
      return `${root}sus4${suffix}`;
    default:
      return `${root}${suffix}`;
  }
}

function isRestToken(token: string): boolean {
  return /^(r|rest|nc|n\.c\.|休符)$/i.test(token.trim());
}

function createRestBlock(source: "symbol" | "roman" = "symbol"): Omit<ChordBlock, "id" | "duration"> {
  return {
    symbol: "R",
    root: "C",
    inversion: "root",
    quality: "rest",
    romanNumeral: "休符",
    notes: [],
    source,
  };
}

function parseDescriptor(descriptor: string): { quality: ChordQuality; descriptor?: string; intervals?: number[] } {
  const normalized = descriptor.toLowerCase();
  if (normalized in EXTENDED_DESCRIPTORS) {
    const entry = EXTENDED_DESCRIPTORS[normalized];
    return {
      quality: entry.quality,
      descriptor: entry.descriptor,
      intervals: entry.intervals,
    };
  }

  return {
    quality: detectQuality(normalized),
  };
}

function detectQuality(descriptor: string): ChordQuality {
  switch (descriptor) {
    case "m":
    case "min":
      return "minor";
    case "ø":
    case "ø7":
    case "m7b5":
    case "halfdim":
      return "halfDiminished";
    case "aug":
    case "+":
      return "augmented";
    case "7":
      return "dominant7";
    case "maj7":
      return "major7";
    case "m7":
    case "min7":
      return "minor7";
    case "add9":
    case "add2":
      return "add9";
    case "madd9":
    case "m(add9)":
      return "minorAdd9";
    case "sus2":
      return "sus2";
    case "6":
      return "sixth";
    case "m6":
      return "minor6";
    case "dim":
      return "diminished";
    case "sus4":
      return "sus4";
    default:
      return "major";
  }
}

function romanToChordSymbol(roman: string, key: string, mode: MusicalMode): Omit<ChordBlock, "id" | "duration"> | null {
  const degree = romanDegree(roman);
  if (degree === null) return null;
  const keyIndex = noteIndex(key);
  if (keyIndex < 0) return null;
  const intervals = mode === "major" ? DEGREE_OFFSETS_MAJOR : DEGREE_OFFSETS_MINOR;
  const root = noteAt(keyIndex + intervals[degree], preferFlatsForSignature(key, mode));
  const quality = romanQuality(roman, mode);
  return {
    symbol: chordSymbol(root, quality),
    root,
    inversion: "root",
    quality,
    romanNumeral: roman,
    notes: rotateNotes(buildChordNotes(root, quality), "root"),
    source: "roman",
  };
}

function arabicDegreeToChordSymbol(token: string, key: string, mode: MusicalMode): Omit<ChordBlock, "id" | "duration"> | null {
  const match = token.match(/^([1-7])(m75|hdm|mis|mas|svn|adn|sut|suf|m7|M7|maj7|dim|aug|sus2|sus4|add9|m|M|7|6|six)?$/);
  if (!match) return null;

  const degree = Number(match[1]) - 1;
  const keyIndex = noteIndex(key);
  if (degree < 0 || degree > 6 || keyIndex < 0) return null;

  const intervals = mode === "major" ? DEGREE_OFFSETS_MAJOR : DEGREE_OFFSETS_MINOR;
  const diatonicQualities: ChordQuality[] =
    mode === "major"
      ? ["major", "minor", "minor", "major", "major", "minor", "diminished"]
      : ["minor", "diminished", "major", "minor", "minor", "major", "major"];

  const root = noteAt(keyIndex + intervals[degree], preferFlatsForSignature(key, mode));
  const suffix = match[2] ?? "";
  let quality = diatonicQualities[degree];
  let descriptor: string | undefined;
  let customIntervals: number[] | undefined;

  switch (suffix) {
    case "":
      descriptor = quality === "halfDiminished" ? "m7b5" : undefined;
      break;
    case "m":
    case "min":
      quality = "minor";
      break;
    case "M":
    case "maj":
      quality = "major";
      break;
    case "dim":
      quality = "diminished";
      descriptor = "dim";
      break;
    case "aug":
      quality = "augmented";
      descriptor = "aug";
      break;
    case "7":
    case "svn":
      quality = quality === "minor" ? "minor7" : "dominant7";
      descriptor = "7";
      break;
    case "m7":
    case "mis":
      quality = "minor7";
      descriptor = "m7";
      break;
    case "M7":
    case "maj7":
    case "mas":
      quality = "major7";
      descriptor = "maj7";
      break;
    case "sus2":
    case "sut":
      quality = "sus2";
      descriptor = "sus2";
      break;
    case "sus4":
    case "suf":
      quality = "sus4";
      descriptor = "sus4";
      break;
    case "add9":
    case "adn":
      quality = quality === "minor" ? "minorAdd9" : "add9";
      descriptor = quality === "minorAdd9" ? "madd9" : "add9";
      break;
    case "6":
    case "six":
      quality = quality === "minor" ? "minor6" : "sixth";
      descriptor = quality === "minor6" ? "m6" : "6";
      break;
    case "m75":
    case "hdm":
      quality = "halfDiminished";
      descriptor = "m7b5";
      customIntervals = QUALITY_INTERVALS.halfDiminished;
      break;
    default:
      return null;
  }

  const chordNotes = customIntervals ? buildNotesFromIntervals(root, customIntervals) : buildChordNotes(root, quality);

  return {
    symbol: chordSymbol(root, quality, descriptor),
    root,
    inversion: "root",
    quality,
    descriptor,
    intervals: customIntervals,
    romanNumeral: chordToRoman(root, quality, key, mode),
    notes: rotateNotes(chordNotes, "root"),
    source: "roman",
  };
}

function chordToRoman(root: string, quality: ChordQuality, key: string, mode: MusicalMode): string {
  if (quality === "rest") return "休符";
  const keyIndex = noteIndex(key);
  const rootIndex = noteIndex(root);
  if (keyIndex < 0 || rootIndex < 0) return "?";
  const distance = (rootIndex - keyIndex + 12) % 12;
  const degrees = mode === "major" ? DEGREE_OFFSETS_MAJOR : DEGREE_OFFSETS_MINOR;
  const labels = mode === "major" ? DEGREE_LABELS_MAJOR : DEGREE_LABELS_MINOR;
  const degree = degrees.findIndex((value) => value === distance);
  if (degree === -1) return "?";
  const base = labels[degree].replace("dim", "");
  const upperBase = base.toUpperCase();
  const lowerBase = base.toLowerCase();
  if (quality === "major") return upperBase;
  if (quality === "minor") return lowerBase;
  if (quality === "diminished") return `${lowerBase}dim`;
  if (quality === "halfDiminished") return `${lowerBase}ø7`;
  if (quality === "augmented") return `${upperBase}aug`;
  if (quality === "dominant7") return `${upperBase}7`;
  if (quality === "major7") return `${upperBase}maj7`;
  if (quality === "minor7") return `${lowerBase}7`;
  if (quality === "add9") return `${upperBase}add9`;
  if (quality === "minorAdd9") return `${lowerBase}add9`;
  if (quality === "sus2") return `${upperBase}sus2`;
  if (quality === "sixth") return `${upperBase}6`;
  if (quality === "minor6") return `${lowerBase}6`;
  if (quality === "sus4") return `${upperBase}sus4`;
  return upperBase;
}

function parseSymbolToken(token: string, key: string, mode: MusicalMode): Omit<ChordBlock, "id" | "duration"> | null {
  if (isRestToken(token)) {
    return createRestBlock("symbol");
  }
  const match = token.match(/^([A-G])([#b]?)([^/\s]*)?(?:\/([A-G][#b]?))?$/i);
  if (!match) return null;
  const root = normalizeNote(`${match[1].toUpperCase()}${match[2] ?? ""}`);
  if (!root) return null;
  const bass = match[4] ? normalizeNote(match[4]) : null;
  if (match[4] && !bass) return null;
  const descriptor = (match[3] ?? "").toLowerCase();
  const parsedDescriptor = parseDescriptor(descriptor);
  const quality = parsedDescriptor.quality;
  const descriptorSuffix = parsedDescriptor.descriptor ?? (descriptor || undefined);
  const chordNotes = parsedDescriptor.intervals
    ? buildNotesFromIntervals(root, parsedDescriptor.intervals)
    : buildChordNotes(root, quality);
  return {
    symbol: chordSymbol(root, quality, descriptorSuffix, bass ?? undefined),
    root,
    bass: bass ?? undefined,
    inversion: "root",
    quality,
    descriptor: descriptorSuffix,
    intervals: parsedDescriptor.intervals,
    romanNumeral: chordToRoman(root, quality, key, mode),
    notes: withBass(rotateNotes(chordNotes, "root"), bass ?? undefined),
    source: "symbol",
  };
}

type ParsedToken = {
  value: string;
  duration: ChordDuration;
  explicitDuration: boolean;
  dotted: boolean;
};

function durationFromBeats(beats: number, timeSignature: TimeSignature): { duration: ChordDuration; dotted: boolean } | null {
  const epsilon = 0.0001;
  const denominator = Number(timeSignature.split("/")[1]);
  const candidates: { duration: ChordDuration; dotted: boolean }[] = [
    { duration: "1 beat", dotted: false },
    { duration: "1 beat", dotted: true },
    { duration: "2 beats", dotted: false },
    { duration: "2 beats", dotted: true },
    { duration: "1 bar", dotted: false },
    { duration: "1 bar", dotted: true },
    { duration: "2 bars", dotted: false },
  ];

  for (const candidate of candidates) {
    if (Math.abs(chordDurationBeats(candidate.duration, timeSignature, candidate.dotted) - beats) < epsilon) {
      return candidate;
    }
  }

  const eighthUnits = (beats * 8) / denominator;
  if (Number.isFinite(eighthUnits) && eighthUnits > 0 && Math.abs(eighthUnits - Math.round(eighthUnits)) < epsilon) {
    return {
      duration: `${Math.round(eighthUnits)}/8`,
      dotted: false,
    };
  }

  return null;
}

function isRepeatToken(token: string): boolean {
  return token === "%" || token === "=";
}

function parseExplicitDurationToken(token: string): { value: string; duration: ChordDuration; dotted: boolean } | null {
  const match = token.match(/^(.*?)(?:\(|（)\s*(\d+)\/8\s*(?:\)|）)(\.)?$/);
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  const numerator = Number(match[2]);
  if (!value || !Number.isFinite(numerator) || numerator <= 0) {
    return null;
  }

  return {
    value,
    duration: `${numerator}/8`,
    dotted: Boolean(match[3]),
  };
}

function tokenizeInput(
  rawInput: string,
  fallbackDuration: ChordDuration,
  timeSignature: TimeSignature,
  inputSlotsPerBar: InputSlotsPerBar,
): { tokens: ParsedToken[]; structured: boolean; errors: ParseError[] } {
  const normalized = rawInput.replace(/\r/g, "");
  const beatsPerBar = Number(timeSignature.split("/")[0]);

  if (/[|\n]/.test(normalized)) {
    const bars = normalized
      .split(/[|\n]+/)
      .map((bar) => bar.trim())
      .filter((bar) => bar.length > 0);
    const structuredTokens: ParsedToken[] = [];
    const errors: ParseError[] = [];
    const pending: Array<{ value: string; beats: number }> = [];
    let previousValue: string | null = null;

    for (const bar of bars) {
      const slots = bar.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean);
      if (slots.length === 0) {
        continue;
      }

      const effectiveSlotCount = slots.includes("-")
        ? [inputSlotsPerBar, 4, 8, 12, 16].find((candidate) => candidate >= slots.length) ?? slots.length
        : slots.length;
      const slotBeats = beatsPerBar / effectiveSlotCount;
      for (const slot of slots) {
        if (slot === "-") {
          const previous = pending[pending.length - 1];
          if (!previous) {
            errors.push({
              token: "-",
              message: "ハイフンの前にコードが必要です",
            });
            continue;
          }
          previous.beats += slotBeats;
          continue;
        }

        if (isRepeatToken(slot)) {
          if (!previousValue) {
            errors.push({
              token: slot,
              message: "繰り返す前のコードがありません",
            });
            continue;
          }
          pending.push({
            value: previousValue,
            beats: slotBeats,
          });
          continue;
        }

        const explicit = parseExplicitDurationToken(slot);
        if (explicit) {
          pending.push({
            value: explicit.value,
            beats: chordDurationBeats(explicit.duration, timeSignature, explicit.dotted),
          });
          previousValue = explicit.value;
          continue;
        }

        pending.push({
          value: slot,
          beats: slotBeats,
        });
        previousValue = slot;
      }
    }

    pending.forEach((entry) => {
      const mapped = durationFromBeats(entry.beats, timeSignature);
      if (!mapped) {
        errors.push({
          token: entry.value,
          message: "この長さは入力表記から決定できません",
        });
        return;
      }

      structuredTokens.push({
        value: entry.value,
        duration: mapped.duration,
        explicitDuration: true,
        dotted: mapped.dotted,
      });
    });

    return { tokens: structuredTokens, structured: true, errors };
  }

  const tokens: ParsedToken[] = [];
  let previousValue: string | null = null;
  for (const part of normalized.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean)) {
    if (part === "-") {
      continue;
    }
    if (isRepeatToken(part)) {
      if (!previousValue) {
        return {
          tokens,
          structured: false,
          errors: [
            {
              token: part,
              message: "繰り返す前のコードがありません",
            },
          ],
        };
      }
      tokens.push({
        value: previousValue,
        duration: fallbackDuration,
        explicitDuration: false,
        dotted: false,
      });
      continue;
    }
    const explicit = parseExplicitDurationToken(part);
    if (explicit) {
      tokens.push({
        value: explicit.value,
        duration: explicit.duration,
        explicitDuration: true,
        dotted: explicit.dotted,
      });
      previousValue = explicit.value;
      continue;
    }
    tokens.push({
      value: part,
      duration: fallbackDuration,
      explicitDuration: false,
      dotted: false,
    });
    previousValue = part;
  }

  return { tokens, structured: false, errors: [] };
}

function isRomanToken(token: string): boolean {
  return romanDegree(token) !== null;
}

function isArabicDegreeToken(token: string): boolean {
  return /^([1-7])(m75|hdm|mis|mas|svn|adn|sut|suf|m7|M7|maj7|dim|aug|sus2|sus4|add9|m|M|7|6|six)?$/.test(token);
}

function detectKeyModeFromSymbols(tokens: string[], fallbackKey: string, fallbackMode: MusicalMode): { key: string; mode: MusicalMode } {
  type CandidateScore = {
    key: string;
    mode: MusicalMode;
    score: number;
  };

  const candidates: CandidateScore[] = [];

  for (const candidateKey of KEY_CANDIDATES) {
    for (const candidateMode of ["major", "minor"] as const) {
      let score = 0;
      for (const [index, token] of tokens.entries()) {
        const parsed = parseSymbolToken(token, candidateKey, candidateMode);
        if (!parsed) continue;
        if (parsed.romanNumeral !== "?") score += 3;
        if (index === 0 && (parsed.romanNumeral.startsWith("I") || parsed.romanNumeral.startsWith("i"))) score += 3;
        if (parsed.romanNumeral.startsWith("I") || parsed.romanNumeral.startsWith("i")) score += 2;
        if (index === tokens.length - 1 && (parsed.romanNumeral.startsWith("I") || parsed.romanNumeral.startsWith("i"))) score += 4;
        if (parsed.romanNumeral.startsWith("V") || parsed.romanNumeral.startsWith("v")) score += 1;
        if (parsed.romanNumeral.startsWith("IV") || parsed.romanNumeral.startsWith("iv")) score += 1;
        if (parsed.root === candidateKey) score += 1;
      }
      if (candidateKey === fallbackKey && candidateMode === fallbackMode) score += 1;
      candidates.push({
        key: candidateKey,
        mode: candidateMode,
        score,
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0] ?? { key: fallbackKey, mode: fallbackMode, score: -1 };

  if (best.mode === "minor") {
    const relativeMajorKey = noteAt(noteIndex(best.key) + 3, preferFlatsForSignature(best.key, best.mode));
    const relativeMajor = candidates.find((candidate) => candidate.key === relativeMajorKey && candidate.mode === "major");
    if (relativeMajor && best.score - relativeMajor.score <= 2) {
      return { key: relativeMajor.key, mode: relativeMajor.mode };
    }
  }

  return { key: best.key, mode: best.mode };
}

export function parseProgression(
  rawInput: string,
  key: string,
  mode: MusicalMode,
  duration: ChordDuration,
  timeSignature: TimeSignature = "4/4",
  inputSlotsPerBar: InputSlotsPerBar = 4,
): ParseResult {
  const tokenized = tokenizeInput(rawInput, duration, timeSignature, inputSlotsPerBar);
  const tokens = tokenized.tokens;
  const looksDegreeBased = tokens.length > 0 && tokens.every((token) => isRomanToken(token.value) || isArabicDegreeToken(token.value));
  const resolved = looksDegreeBased ? { key, mode } : detectKeyModeFromSymbols(tokens.map((token) => token.value), key, mode);
  const chords: ChordBlock[] = [];
  const errors: ParseResult["errors"] = [...tokenized.errors];
  const explicitDurationIndexes: number[] = [];

  for (const [index, token] of tokens.entries()) {
    const arabicCandidate = arabicDegreeToChordSymbol(token.value, resolved.key, resolved.mode);
    const romanCandidate = romanToChordSymbol(token.value, resolved.key, resolved.mode);
    const symbolCandidate = parseSymbolToken(token.value, resolved.key, resolved.mode);
    const parsed = arabicCandidate ?? romanCandidate ?? symbolCandidate;

    if (!parsed) {
      errors.push({
        token: token.value,
        message: "解釈できないコードです",
      });
      continue;
    }

    chords.push({
      id: createChordId(),
      duration: token.duration,
      inversion: "root",
      dotted: token.dotted,
      ...parsed,
    });

    if (token.explicitDuration || tokenized.structured) {
      explicitDurationIndexes.push(index);
    }
  }

  return { chords, errors, resolvedKey: resolved.key, resolvedMode: resolved.mode, explicitDurationIndexes };
}

export function createChordId(): string {
  return `chord-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDuration(duration?: string): ChordDuration {
  if (duration === "quarter") return "1 beat";
  if (duration === "half") return "2 beats";
  if (duration === "triplet") return "1 beat";
  if (duration && /^\d+\/8$/.test(duration)) return duration as ChordDuration;
  if (duration === "1 beat" || duration === "2 beats" || duration === "1 bar" || duration === "2 bars") {
    return duration;
  }
  return "1 bar";
}

function normalizeStyle(style?: string): StylePreset {
  if (style === "1st" || style === "2nd" || style === "3rd" || style === "root") {
    return style;
  }
  return "root";
}

export function progressionToInput(
  chords: ChordBlock[],
  notationPreference: NotationPreference,
  timeSignature: TimeSignature = "4/4",
  inputSlotsPerBar: InputSlotsPerBar = 4,
): string {
  const beatsPerBar = Number(timeSignature.split("/")[0]);
  const epsilon = 0.0001;
  const bars: Array<Array<{ token: string; beats: number; continued: boolean }>> = [];
  let currentBeat = 0;

  chords.forEach((chord) => {
    const token = notationPreference === "roman" && !chord.bass ? chord.romanNumeral : chord.symbol;
    let remaining = chordDurationBeats(chord.duration, timeSignature, chord.dotted);
    let continued = false;

    while (remaining > epsilon) {
      const barIndex = Math.floor(currentBeat / beatsPerBar);
      const beatInBar = currentBeat - barIndex * beatsPerBar;
      const chunk = Math.min(remaining, beatsPerBar - beatInBar);
      bars[barIndex] ??= [];
      bars[barIndex].push({
        token,
        beats: chunk,
        continued,
      });
      currentBeat += chunk;
      remaining -= chunk;
      continued = true;
    }
  });

  return bars
    .filter((bar) => bar.length > 0)
    .map((bar) => {
      const occupiedBeats = bar.reduce((sum, segment) => sum + segment.beats, 0);
      const spanBeats = Math.abs(occupiedBeats - beatsPerBar) < epsilon ? beatsPerBar : occupiedBeats;
      const preferredCounts = [inputSlotsPerBar, 4, 8, 6, 3, 2, 1];
      const slotCount =
        preferredCounts.find((count) => {
          const slotBeats = spanBeats / count;
          return bar.every((segment) => Math.abs(segment.beats / slotBeats - Math.round(segment.beats / slotBeats)) < epsilon);
        }) ?? 1;
      const slotBeats = spanBeats / slotCount;
      const tokens: string[] = [];

      bar.forEach((segment) => {
        const units = Math.max(1, Math.round(segment.beats / slotBeats));
        tokens.push(segment.continued ? "-" : segment.token);
        for (let index = 1; index < units; index += 1) {
          tokens.push("-");
        }
      });

      return tokens.join(" ");
    })
    .join(" | ");
}

export function rebuildProgressionFromRoman(
  chords: ChordBlock[],
  key: string,
  mode: MusicalMode,
  duration: ChordDuration,
): ChordBlock[] {
  return chords.map((chord) => {
    if (chord.quality === "rest") {
      return {
        ...chord,
        duration,
      };
    }
    const rebuilt = romanToChordSymbol(chord.romanNumeral, key, mode);
    if (!rebuilt) {
      return {
        ...chord,
        duration,
      };
    }
    return {
      id: chord.id,
        duration,
        inversion: chord.inversion ?? "root",
        dotted: chord.dotted,
        ...rebuilt,
      descriptor: chord.descriptor,
      intervals: chord.intervals,
      bass: rebasedBass(rebuilt.root, chord.root, chord.bass),
      symbol: chordSymbol(
        rebuilt.root,
        rebuilt.quality,
        chord.descriptor,
        rebasedBass(rebuilt.root, chord.root, chord.bass),
      ),
      notes: withBass(
        chord.intervals ? buildNotesFromIntervals(rebuilt.root, chord.intervals) : rebuilt.notes,
        rebasedBass(rebuilt.root, chord.root, chord.bass),
      ),
      source: chord.source,
    };
  });
}

export function transposeChord(chord: ChordBlock, semitones: number, key: string, mode: MusicalMode): ChordBlock {
  if (chord.quality === "rest") {
    return chord;
  }
  const preferFlats = preferFlatsForSignature(key, mode) || chord.root.includes("b");
  const transposedRoot = noteAt(noteIndex(chord.root) + semitones, preferFlats);
  const quality = chord.quality;
  const bass = chord.bass ? noteAt(noteIndex(chord.bass) + semitones, preferFlats) : undefined;
  return {
    ...chord,
    root: transposedRoot,
    bass,
    inversion: chord.inversion ?? "root",
    symbol: chordSymbol(transposedRoot, quality, chord.descriptor, bass),
    romanNumeral: chordToRoman(transposedRoot, quality, key, mode),
    notes: withBass(
      chord.intervals ? buildNotesFromIntervals(transposedRoot, chord.intervals) : buildChordNotes(transposedRoot, quality),
      bass,
    ),
  };
}

export function transposeProgression(chords: ChordBlock[], semitones: number, key: string, mode: MusicalMode): ChordBlock[] {
  return chords.map((chord) => transposeChord(chord, semitones, key, mode));
}

export function applyChordVariation(chord: ChordBlock, variation: "7th" | "sus4", key: string, mode: MusicalMode): ChordBlock {
  if (chord.quality === "rest") {
    return chord;
  }
  let quality: ChordQuality = chord.quality;
  if (variation === "7th") {
    if (chord.quality === "major") quality = "major7";
    if (chord.quality === "minor") quality = "minor7";
  }
  if (variation === "sus4") quality = "sus4";
  return {
    ...chord,
    quality,
    bass: undefined,
    inversion: chord.inversion ?? "root",
    descriptor: undefined,
    intervals: undefined,
    symbol: chordSymbol(chord.root, quality),
    romanNumeral: chordToRoman(chord.root, quality, key, mode),
    notes: rotateNotes(buildChordNotes(chord.root, quality), chord.inversion ?? "root"),
  };
}

export function applyInversion(chord: ChordBlock, inversion: StylePreset): ChordBlock {
  if (chord.quality === "rest") {
    return chord;
  }
  if (chord.bass) {
    return {
      ...chord,
      inversion: "root",
      notes: withBass(rotateNotes(buildChordNotes(chord.root, chord.quality), "root"), chord.bass),
    };
  }

  const chordNotes = chord.intervals ? buildNotesFromIntervals(chord.root, chord.intervals) : buildChordNotes(chord.root, chord.quality);
  return {
    ...chord,
    inversion,
    notes: rotateNotes(chordNotes, inversion),
  };
}

export function chordDurationBeats(duration: ChordDuration, timeSignature: TimeSignature, dotted = false): number {
  const beatsPerBar = Number(timeSignature.split("/")[0]);
  const denominator = Number(timeSignature.split("/")[1]);
  let beats = beatsPerBar;
  if (duration === "1 beat") beats = 1;
  else if (duration === "2 beats") beats = Math.min(2, beatsPerBar);
  else if (duration === "2 bars") beats = beatsPerBar * 2;
  else if (/^\d+\/8$/.test(duration)) {
    const numerator = Number(duration.split("/")[0]);
    beats = numerator * (denominator / 8);
  }
  return dotted ? beats * 1.5 : beats;
}

export function durationLabel(duration: ChordDuration, dotted = false): string {
  const base =
    duration === "1 beat"
      ? "1拍"
      : duration === "2 beats"
        ? "2拍"
        : duration === "1 bar"
          ? "1小節"
          : duration === "2 bars"
            ? "2小節"
            : duration;
  return `${base}${dotted ? "・" : ""}`;
}

export function barLineIndexes(chords: ChordBlock[], timeSignature: TimeSignature): number[] {
  const beatsPerBar = Number(timeSignature.split("/")[0]);
  const epsilon = 0.0001;
  let accumulated = 0;
  const indexes: number[] = [];

  chords.forEach((chord, index) => {
    accumulated += chordDurationBeats(chord.duration, timeSignature, chord.dotted);
    const remainder = accumulated % beatsPerBar;
    if (Math.abs(remainder) < epsilon || Math.abs(remainder - beatsPerBar) < epsilon) {
      indexes.push(index);
    }
  });

  return indexes;
}

export function midiNoteNumbers(
  chord: ChordBlock,
  options: { bassAddition?: BassAdditionMode; openVoicing?: OpenVoicingMode } = {},
): number[] {
  if (chord.quality === "rest") {
    return [];
  }
  const rootBase = 60;
  const rootOffset = noteIndex(chord.root);
  const intervals = chord.intervals ?? QUALITY_INTERVALS[chord.quality];
  const inversion = chord.bass ? "root" : chord.inversion ?? "root";
  const inversionSteps = inversion === "1st" ? 1 : inversion === "2nd" ? 2 : inversion === "3rd" ? 3 : 0;
  const safeSteps = Math.min(inversionSteps, Math.max(0, intervals.length - 1));
  const chordNotes = intervals.map((interval) => rootBase + rootOffset + interval);
  for (let index = 0; index < safeSteps; index += 1) {
    chordNotes[index] += 12;
  }
  if (options.openVoicing === "third" && chordNotes.length >= 2) {
    chordNotes[1] += 12;
  } else if (options.openVoicing === "fifth" && chordNotes.length >= 3) {
    chordNotes[2] += 12;
  }
  chordNotes.sort((left, right) => left - right);
  const bassSource = chord.bass ?? chord.root;
  const bassOffset = noteIndex(bassSource);
  if (bassOffset < 0) {
    return chordNotes;
  }
  const bassNotes: number[] = [];
  if (chord.bass) {
    bassNotes.push(48 + bassOffset);
  }
  if (options.bassAddition === "one" || options.bassAddition === "both") {
    bassNotes.push(24 + bassOffset);
  }
  if (options.bassAddition === "two" || options.bassAddition === "both") {
    bassNotes.push(36 + bassOffset);
  }
  return [...new Set([...bassNotes, ...chordNotes])].sort((left, right) => left - right);
}

export function suggestionSet(chords: ChordBlock[], key: string, mode: MusicalMode): SuggestionItem[] {
  const base = diatonicChords(key, mode);
  const pick = (indexes: number[]) => indexes.map((index) => base[index]).filter(Boolean);

  if (chords.length === 0) return pick([0, 4, 5, 3]);
  const last = chords[chords.length - 1];
  if (last.romanNumeral.startsWith("V") || last.romanNumeral.startsWith("v")) return pick([0, 5, 3, 1]);
  if (last.romanNumeral.toLowerCase().startsWith("vi")) return pick([3, 4, 0, 1]);
  if (last.romanNumeral.toLowerCase().startsWith("ii")) return pick([4, 0, 5, 3]);
  return pick([4, 5, 3, 2]);
}

export function diatonicChords(key: string, mode: MusicalMode): SuggestionItem[] {
  const keyIndex = noteIndex(key);
  const degrees = mode === "major" ? DEGREE_OFFSETS_MAJOR : DEGREE_OFFSETS_MINOR;
  const qualities: ChordQuality[] =
    mode === "major"
      ? ["major", "minor", "minor", "major", "major", "minor", "halfDiminished"]
      : ["minor", "diminished", "major", "minor", "minor", "major", "major"];
  const labels = mode === "major" ? DEGREE_LABELS_MAJOR : DEGREE_LABELS_MINOR;
  const preferFlats = preferFlatsForSignature(key, mode);
  return degrees.map((distance, index) => ({
    symbol: chordSymbol(noteAt(keyIndex + distance, preferFlats), qualities[index]),
    romanNumeral: labels[index],
  }));
}

export function projectToJson(project: ProjectData): string {
  return JSON.stringify(project, null, 2);
}

export function projectFromJson(json: string): ProjectData {
  const parsed = JSON.parse(json) as Partial<ProjectData>;
  const chords = Array.isArray(parsed.chords)
    ? parsed.chords.map((chord) => ({
        ...chord,
        duration: normalizeDuration(chord.duration),
        inversion: normalizeStyle(chord.inversion),
        dotted: Boolean(chord.dotted),
        notes: Array.isArray(chord.notes) ? chord.notes : [],
      }))
    : DEFAULT_PROJECT.chords;
  return {
      ...DEFAULT_PROJECT,
      ...parsed,
      style: normalizeStyle(parsed.style),
      chordDuration: normalizeDuration(parsed.chordDuration),
      inputSlotsPerBar: parsed.inputSlotsPerBar === 8 ? 8 : 4,
      playbackTone:
        parsed.playbackTone === "pad" || parsed.playbackTone === "organ" || parsed.playbackTone === "pluck"
          ? parsed.playbackTone
          : "piano",
      bassAddition:
        parsed.bassAddition === "one" || parsed.bassAddition === "two" || parsed.bassAddition === "both"
          ? parsed.bassAddition
          : "none",
      openVoicing: parsed.openVoicing === "third" || parsed.openVoicing === "fifth" ? parsed.openVoicing : "closed",
      chords,
      notationPreference: parsed.notationPreference ?? DEFAULT_PROJECT.notationPreference,
    };
  }

export function styleLabel(style: StylePreset): string {
  switch (style) {
    case "1st":
      return "1転";
    case "2nd":
      return "2転";
    case "3rd":
      return "3転";
    default:
      return "基本";
  }
}
