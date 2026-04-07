export type MusicalMode = "major" | "minor";
export type TimeSignature = "4/4" | "3/4";
export type InputSlotsPerBar = 4 | 8;
export type StylePreset = "root" | "1st" | "2nd" | "3rd";
export type PlaybackTone = "piano" | "pad" | "organ" | "pluck";
export type BassAdditionMode = "none" | "one" | "two" | "both";
export type OpenVoicingMode = "closed" | "third" | "fifth";
export type ChordDuration = "1 beat" | "2 beats" | "1 bar" | "2 bars" | `${number}/8`;
export type NotationPreference = "roman" | "symbol";
export type ChordQuality =
  | "rest"
  | "major"
  | "minor"
  | "diminished"
  | "halfDiminished"
  | "augmented"
  | "dominant7"
  | "major7"
  | "minor7"
  | "add9"
  | "minorAdd9"
  | "sus2"
  | "sixth"
  | "minor6"
  | "sus4";

export type ChordBlock = {
  id: string;
  symbol: string;
  root: string;
  bass?: string;
  inversion?: StylePreset;
  barAfter?: boolean;
  quality: ChordQuality;
  descriptor?: string;
  intervals?: number[];
  romanNumeral: string;
  duration: ChordDuration;
  dotted?: boolean;
  notes: string[];
  source: "symbol" | "roman";
};

export type ParseError = {
  token: string;
  message: string;
};

export type ParseResult = {
  chords: ChordBlock[];
  errors: ParseError[];
  resolvedKey: string;
  resolvedMode: MusicalMode;
  explicitDurationIndexes: number[];
};

export type ProgressionTemplate = {
  id: string;
  category: string;
  name: string;
  progression: string;
  description: string;
};

export type SuggestionItem = {
  symbol: string;
  romanNumeral: string;
};

export type ProjectData = {
  title: string;
  key: string;
  mode: MusicalMode;
  bpm: number;
  timeSignature: TimeSignature;
  inputSlotsPerBar: InputSlotsPerBar;
  playbackTone: PlaybackTone;
  bassAddition: BassAdditionMode;
  openVoicing: OpenVoicingMode;
  chordDuration: ChordDuration;
  style: StylePreset;
  notationPreference: NotationPreference;
  rawInput: string;
  chords: ChordBlock[];
};
