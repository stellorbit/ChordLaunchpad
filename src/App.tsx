import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import "./App.css";
import { DEFAULT_TEMPLATES } from "./data/defaultTemplates";
import { buildMidiFile } from "./lib/midi";
import {
  applyInversion,
  barLineIndexes,
  DEFAULT_PROJECT,
  chordDurationBeats,
  createChordId,
  diatonicChords,
  durationLabel,
  midiNoteNumbers,
  parseProgression,
  progressionToInput,
  projectFromJson,
  projectToJson,
  rebuildProgressionFromRoman,
  suggestionSet,
  transposeProgression,
} from "./lib/music";
import type {
  BassAdditionMode,
  ChordBlock,
  ChordDuration,
  InputSlotsPerBar,
  MusicalMode,
  NotationPreference,
  OpenVoicingMode,
  ParseError,
  PlaybackTone,
  ProgressionTemplate,
  ProjectData,
  StylePreset,
  SuggestionItem,
  TimeSignature,
} from "./types/music";

type StatusTone = "neutral" | "success" | "error";
type CollapseKey = "input" | "templates";
type HistoryEntry = {
  project: ProjectData;
  selectedChordId: string | null;
};

const STORAGE_KEY = "chord-draft-project";
const TEMPLATE_STORAGE_KEY = "chord-draft-templates-v2";
const NOTE_ORDER = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const DURATION_OPTIONS: { value: ChordDuration; label: string }[] = [
  { value: "1/8", label: "1/8" },
  { value: "2/8", label: "2/8" },
  { value: "3/8", label: "3/8" },
  { value: "4/8", label: "4/8" },
  { value: "5/8", label: "5/8" },
  { value: "6/8", label: "6/8" },
  { value: "7/8", label: "7/8" },
  { value: "1 beat", label: "1拍" },
  { value: "2 beats", label: "2拍" },
  { value: "1 bar", label: "1小節" },
  { value: "2 bars", label: "2小節" },
];
const SLOT_OPTIONS: InputSlotsPerBar[] = [4, 8];
const PLAYBACK_TONE_OPTIONS: { value: PlaybackTone; label: string }[] = [
  { value: "piano", label: "Piano" },
  { value: "pad", label: "Pad" },
  { value: "organ", label: "Organ" },
  { value: "pluck", label: "Pluck" },
];
const BASS_ADDITION_OPTIONS: { value: BassAdditionMode; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "one", label: "1" },
  { value: "two", label: "2" },
  { value: "both", label: "両方" },
];
const OPEN_VOICING_OPTIONS: { value: OpenVoicingMode; label: string }[] = [
  { value: "closed", label: "なし" },
  { value: "third", label: "3度" },
  { value: "fifth", label: "5度" },
];
const INVERSION_OPTIONS: StylePreset[] = ["root", "1st", "2nd", "3rd"];

function cloneProject(project: ProjectData): ProjectData {
  return projectFromJson(projectToJson(project));
}

function createHistoryEntry(project: ProjectData, selectedChordId: string | null): HistoryEntry {
  return {
    project: cloneProject(project),
    selectedChordId,
  };
}

function sanitizeFilename(input: string, fallback: string): string {
  const sanitized = input.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "-");
  return sanitized || fallback;
}

function createTemplateId(): string {
  return `template-${Math.random().toString(36).slice(2, 10)}`;
}

function createTemplateDraft(progression = ""): ProgressionTemplate {
  return {
    id: "",
    category: "カスタム",
    name: "",
    progression,
    description: "",
  };
}

function loadTemplates(): ProgressionTemplate[] {
  const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (!saved) {
    return DEFAULT_TEMPLATES;
  }

  try {
    const parsed = JSON.parse(saved) as ProgressionTemplate[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_TEMPLATES;
    }
    return parsed;
  } catch {
    localStorage.removeItem(TEMPLATE_STORAGE_KEY);
    return DEFAULT_TEMPLATES;
  }
}

function createInitialProject(): ProjectData {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return projectFromJson(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const parsed = parseProgression(
    DEFAULT_PROJECT.rawInput,
      DEFAULT_PROJECT.key,
      DEFAULT_PROJECT.mode,
      DEFAULT_PROJECT.chordDuration,
      DEFAULT_PROJECT.timeSignature,
      DEFAULT_PROJECT.inputSlotsPerBar,
    );

  return {
    ...DEFAULT_PROJECT,
    key: parsed.resolvedKey,
    mode: parsed.resolvedMode,
    chords: parsed.chords,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function displayLabel(chord: ChordBlock | SuggestionItem, notation: NotationPreference): string {
  if ("quality" in chord && chord.quality === "rest") {
    return chord.symbol;
  }
  if ("bass" in chord && chord.bass) {
    return chord.symbol;
  }
  return notation === "roman" ? chord.romanNumeral : chord.symbol;
}

function secondaryLabel(chord: ChordBlock | SuggestionItem, notation: NotationPreference): string {
  if ("quality" in chord && chord.quality === "rest") {
    return chord.romanNumeral;
  }
  if ("bass" in chord && chord.bass) {
    return chord.romanNumeral;
  }
  return notation === "roman" ? chord.symbol : chord.romanNumeral;
}

function applyExistingDurations(
  nextChords: ChordBlock[],
  previousChords: ChordBlock[],
  fallback: ChordDuration,
  explicitDurationIndexes: number[],
  defaultInversion: StylePreset,
): ChordBlock[] {
  return nextChords.map((chord, index) => ({
    ...chord,
    duration: explicitDurationIndexes.includes(index)
      ? chord.duration
      : previousChords[index]?.duration ?? chord.duration ?? fallback,
    dotted: chord.dotted ?? previousChords[index]?.dotted ?? false,
    inversion: chord.bass ? "root" : previousChords[index]?.inversion ?? defaultInversion,
  }));
}

function cycleDuration(duration: ChordDuration, step: -1 | 1): ChordDuration {
  const index = DURATION_OPTIONS.findIndex((option) => option.value === duration);
  if (index === -1) {
    return duration;
  }
  return DURATION_OPTIONS[(index + step + DURATION_OPTIONS.length) % DURATION_OPTIONS.length].value;
}

function cycleInversion(inversion: StylePreset, step: -1 | 1): StylePreset {
  const index = INVERSION_OPTIONS.findIndex((option) => option === inversion);
  return INVERSION_OPTIONS[(index + step + INVERSION_OPTIONS.length) % INVERSION_OPTIONS.length];
}

function App() {
  const initialProject = useRef<ProjectData>(createInitialProject());
  const [project, setProject] = useState<ProjectData>(initialProject.current);
  const [selectedChordId, setSelectedChordId] = useState<string | null>(initialProject.current.chords[0]?.id ?? null);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadIndex, setPlayheadIndex] = useState<number | null>(null);
  const [inputDraft, setInputDraft] = useState(initialProject.current.rawInput);
  const [statusMessage, setStatusMessage] = useState("準備完了");
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [collapsed, setCollapsed] = useState<Record<CollapseKey, boolean>>({
    input: false,
    templates: true,
  });
  const [templates, setTemplates] = useState<ProgressionTemplate[]>(loadTemplates());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(loadTemplates()[0]?.id ?? "");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<ProgressionTemplate>(createTemplateDraft(initialProject.current.rawInput));
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const playbackRunIdRef = useRef(0);
  const isPlayingRef = useRef(false);
  const loopEnabledRef = useRef(false);
  const skipAutoParseRef = useRef(false);
  const [draggingChordId, setDraggingChordId] = useState<string | null>(null);
  const [dragOverChordId, setDragOverChordId] = useState<string | null>(null);
  const [isPreparingMidiDrag, setIsPreparingMidiDrag] = useState(false);
  const [draggingPaletteItem, setDraggingPaletteItem] = useState<SuggestionItem | null>(null);
  const [isTimelineDragTarget, setIsTimelineDragTarget] = useState(false);
  const [showChordPad, setShowChordPad] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const selectedChord = project.chords.find((chord) => chord.id === selectedChordId) ?? null;
  const inspectorChord = isPlaying && playheadIndex !== null ? project.chords[playheadIndex] ?? selectedChord : selectedChord;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const keyGuide = diatonicChords(project.key, project.mode);
  const suggestions = suggestionSet(project.chords, project.key, project.mode);
  const autoBarIndexes = new Set(barLineIndexes(project.chords, project.timeSignature));
  const hasRomanInput = /(^|[\s,|\-])(i|ii|iii|iv|v|vi|vii)(7|sus4|dim)?(?=$|[\s,|\-])/i.test(project.rawInput);
  const durationOptionsForChord =
    selectedChord && !DURATION_OPTIONS.some((option) => option.value === selectedChord.duration)
      ? [...DURATION_OPTIONS, { value: selectedChord.duration, label: durationLabel(selectedChord.duration) }]
      : DURATION_OPTIONS;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, projectToJson(project));
  }, [project]);

  useEffect(() => {
    setInputDraft(project.rawInput);
  }, [project.rawInput]);

  useEffect(() => {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates, null, 2));
  }, [templates]);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0]?.id ?? "");
    }

    if (editingTemplateId && !templates.some((template) => template.id === editingTemplateId)) {
      setEditingTemplateId(null);
      setTemplateDraft(createTemplateDraft(project.rawInput));
    }
  }, [templates, selectedTemplateId, editingTemplateId, project.rawInput]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey;
      if (isMeta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        resetProject();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProjectJson();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProjectJson();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "e") {
        event.preventDefault();
        void exportMidi();
        return;
      }

      if (isMeta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoProjectChange();
        } else {
          undoProjectChange();
        }
        return;
      }

      if (isMeta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProjectChange();
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, [role='button']")) {
          return;
        }
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        if (isPlayingRef.current) {
          stopPlayback();
        } else {
          startPlayback();
        }
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedChord) {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (!selectedChord) {
        return;
      }

      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        updateSelectedDuration(cycleDuration(selectedChord.duration, -1));
        return;
      }

      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        updateSelectedDuration(cycleDuration(selectedChord.duration, 1));
        return;
      }

      if (event.altKey && event.key === ".") {
        event.preventDefault();
        toggleSelectedDotted();
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        updateSelectedInversion(cycleInversion(selectedChord.bass ? "root" : selectedChord.inversion ?? "root", 1));
        return;
      }

      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        updateSelectedInversion(cycleInversion(selectedChord.bass ? "root" : selectedChord.inversion ?? "root", -1));
        return;
      }

      if (isMeta && event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelected(-1);
        return;
      }

      if (isMeta && event.key === "ArrowRight") {
        event.preventDefault();
        moveSelected(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const index = project.chords.findIndex((chord) => chord.id === selectedChord.id);
        const nextChord = project.chords[index - 1];
        if (nextChord) {
          previewTimelineChord(nextChord);
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const index = project.chords.findIndex((chord) => chord.id === selectedChord.id);
        const nextChord = project.chords[index + 1];
        if (nextChord) {
          previewTimelineChord(nextChord);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedChord, project.chords, undoStack, redoStack, project, selectedChordId]);

  useEffect(() => {
    const handlePointerUp = () => {
      setDraggingChordId(null);
      setDragOverChordId(null);
      setDraggingPaletteItem(null);
      setIsTimelineDragTarget(false);
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  useEffect(() => {
    if (!selectedChord) {
      setShowChordPad(false);
    }
  }, [selectedChordId]);

  function setStatus(message: string, tone: StatusTone = "neutral"): void {
    setStatusMessage(message);
    setStatusTone(tone);
  }

  function openWebHelpPlaceholder(): void {
    setStatus("WebヘルプURLは未設定です", "neutral");
  }

  function toggleSection(section: CollapseKey): void {
    setCollapsed((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function syncProject(nextProject: ProjectData, skipAutoParse = false, recordHistory = true): void {
    if (skipAutoParse) {
      skipAutoParseRef.current = true;
    }
    if (recordHistory && projectToJson(project) !== projectToJson(nextProject)) {
      setUndoStack((current) => [...current.slice(-49), createHistoryEntry(project, selectedChordId)]);
      setRedoStack([]);
    }
    setProject(nextProject);
    if (!nextProject.chords.some((chord) => chord.id === selectedChordId)) {
      setSelectedChordId(nextProject.chords[0]?.id ?? null);
    }
  }

  function applyHistoryEntry(entry: HistoryEntry, status: string): void {
    syncProject(entry.project, true, false);
    setSelectedChordId(entry.selectedChordId);
    setErrors([]);
    setStatus(status, "neutral");
  }

  function undoProjectChange(): void {
    if (undoStack.length === 0) {
      setStatus("これ以上戻せません", "neutral");
      return;
    }

    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, createHistoryEntry(project, selectedChordId)]);
    applyHistoryEntry(previous, "元に戻しました");
  }

  function redoProjectChange(): void {
    if (redoStack.length === 0) {
      setStatus("これ以上進めません", "neutral");
      return;
    }

    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-49), createHistoryEntry(project, selectedChordId)]);
    applyHistoryEntry(next, "やり直しました");
  }

  function runParse(
    rawInput: string,
    nextKey = project.key,
    nextMode = project.mode,
    nextDuration = project.chordDuration,
    silent = false,
    preserveExistingSettings = true,
    ): void {
      const parsed = parseProgression(rawInput, nextKey, nextMode, nextDuration, project.timeSignature, project.inputSlotsPerBar);
    const nextChords = preserveExistingSettings
      ? applyExistingDurations(parsed.chords, project.chords, nextDuration, parsed.explicitDurationIndexes, project.style)
      : parsed.chords.map((chord, index) => ({
          ...chord,
          duration: parsed.explicitDurationIndexes.includes(index) ? chord.duration : nextDuration,
          dotted: chord.dotted ?? false,
          inversion: "root" as StylePreset,
        }));
    setErrors(parsed.errors);
    syncProject(
      {
        ...project,
        key: parsed.resolvedKey,
        mode: parsed.resolvedMode,
        chordDuration: nextDuration,
        rawInput,
        chords: nextChords,
      },
      true,
    );

    if (silent) {
      if (nextChords.length > 0 && !selectedChordId) {
        setSelectedChordId(nextChords[0].id);
      }
      return;
    }

    if (nextChords.length > 0) {
      setSelectedChordId(nextChords[0].id);
      setStatus(`${nextChords.length} 個のコードを反映`, parsed.errors.length === 0 ? "success" : "error");
    } else {
      setSelectedChordId(null);
      setStatus("有効なコードが見つかりません", "error");
    }
  }

  function updateProjectMeta<K extends keyof ProjectData>(key: K, value: ProjectData[K]): void {
    if (key === "rawInput") {
      syncProject({
        ...project,
        rawInput: value as string,
      });
      return;
    }

    if (key === "notationPreference") {
      const nextNotation = value as NotationPreference;
      syncProject(
        {
          ...project,
          notationPreference: nextNotation,
          rawInput: progressionToInput(project.chords, nextNotation, project.timeSignature, project.inputSlotsPerBar),
        },
        true,
      );
      setStatus(nextNotation === "roman" ? "ディグリー優先表示" : "コード優先表示", "success");
      return;
    }

    if (key === "playbackTone") {
      const nextTone = value as PlaybackTone;
      syncProject(
        {
          ...project,
          playbackTone: nextTone,
        },
        true,
      );
      setStatus(`音色を ${toneLabel(nextTone)} に変更`, "success");
      return;
    }

    if (key === "bassAddition") {
      const nextBassAddition = value as BassAdditionMode;
      syncProject(
        {
          ...project,
          bassAddition: nextBassAddition,
        },
        true,
      );
      setStatus(`ベース追加を ${BASS_ADDITION_OPTIONS.find((option) => option.value === nextBassAddition)?.label ?? "なし"} に変更`, "success");
      return;
    }

    if (key === "openVoicing") {
      const nextOpenVoicing = value as OpenVoicingMode;
      syncProject(
        {
          ...project,
          openVoicing: nextOpenVoicing,
        },
        true,
      );
      setStatus(`オープンボイシングを ${OPEN_VOICING_OPTIONS.find((option) => option.value === nextOpenVoicing)?.label ?? "なし"} に変更`, "success");
      return;
    }

    if (key === "key" || key === "mode" || key === "chordDuration") {
      const nextKey = key === "key" ? (value as string) : project.key;
      const nextMode = key === "mode" ? (value as MusicalMode) : project.mode;
      const nextDuration = key === "chordDuration" ? (value as ChordDuration) : project.chordDuration;

      if (project.chords.length > 0) {
        const nextChords = rebuildProgressionFromRoman(project.chords, nextKey, nextMode, nextDuration).map((chord, index) => ({
          ...chord,
          duration: key === "chordDuration" ? nextDuration : project.chords[index]?.duration ?? chord.duration,
        }));
        syncProject(
          {
            ...project,
            key: nextKey,
            mode: nextMode,
            chordDuration: nextDuration,
            chords: nextChords,
            rawInput: progressionToInput(nextChords, project.notationPreference, project.timeSignature, project.inputSlotsPerBar),
          },
          true,
        );
        setErrors([]);
        setStatus("ディグリー基準で再構築", "success");
        return;
      }

      syncProject(
        {
          ...project,
          key: nextKey,
          mode: nextMode,
          chordDuration: nextDuration,
        },
        true,
      );
      setErrors([]);
      setStatus("設定を更新", "success");
      return;
    }

    if (key === "timeSignature" || key === "inputSlotsPerBar") {
      const nextTimeSignature = key === "timeSignature" ? (value as TimeSignature) : project.timeSignature;
      const nextInputSlotsPerBar = key === "inputSlotsPerBar" ? (value as InputSlotsPerBar) : project.inputSlotsPerBar;

      syncProject(
        {
          ...project,
          timeSignature: nextTimeSignature,
          inputSlotsPerBar: nextInputSlotsPerBar,
          rawInput: progressionToInput(project.chords, project.notationPreference, nextTimeSignature, nextInputSlotsPerBar),
        },
        true,
      );
      setStatus("入力グリッドを更新", "success");
      return;
    }

    syncProject({
      ...project,
      [key]: value,
    });
  }

  function clearProgression(): void {
    stopPlayback();
    setErrors([]);
    setInputDraft("");
    setSelectedChordId(null);
    syncProject(
      {
        ...project,
        rawInput: "",
        chords: [],
      },
      true,
    );
    setStatus("進行をクリア", "neutral");
  }

  function updateChords(nextChords: ChordBlock[], message: string, tone: StatusTone = "success"): void {
    syncProject(
      {
        ...project,
        rawInput: progressionToInput(nextChords, project.notationPreference, project.timeSignature, project.inputSlotsPerBar),
        chords: nextChords,
      },
      true,
    );
    setErrors([]);
    setSelectedChordId(nextChords[0]?.id ?? null);
    setStatus(message, tone);
  }

  function updateSelectedDuration(duration: ChordDuration): void {
    if (!selectedChord) return;
    const nextChords = project.chords.map((chord) =>
      chord.id === selectedChord.id
        ? {
            ...chord,
            duration,
          }
        : chord,
    );
    updateChords(nextChords, "コード長を変更");
    setSelectedChordId(selectedChord.id);
  }

  function toggleSelectedDotted(): void {
    if (!selectedChord) return;
    const nextChords = project.chords.map((chord) =>
      chord.id === selectedChord.id
        ? {
            ...chord,
            dotted: !chord.dotted,
          }
        : chord,
    );
    updateChords(nextChords, selectedChord.dotted ? "付点を解除" : "付点を追加");
    setSelectedChordId(selectedChord.id);
  }

  function updateSelectedInversion(inversion: StylePreset): void {
    if (!selectedChord) return;
    const updatedChord = applyInversion(selectedChord, inversion);
    const nextChords = project.chords.map((chord) => (chord.id === selectedChord.id ? updatedChord : chord));
    updateChords(nextChords, "転回形を変更");
    setSelectedChordId(selectedChord.id);
    stopPlayback();
    playMidiNotes(voicedMidiNotes(updatedChord), 900);
  }

  function updateTemplateDraft<K extends keyof ProgressionTemplate>(key: K, value: ProgressionTemplate[K]): void {
    setTemplateDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function loadTemplateDraftFromProgression(progression: string, sourceLabel: string): void {
    setEditingTemplateId(null);
    setTemplateDraft({
      ...createTemplateDraft(progression),
      category: "カスタム",
      name: `${project.title} ${sourceLabel}`,
      progression,
      description: `${sourceLabel}から追加`,
    });
    setStatus(`テンプレート下書きに${sourceLabel}を読込`, "success");
  }

  function saveTemplateAsNew(): void {
    const trimmedName = templateDraft.name.trim();
    const trimmedProgression = templateDraft.progression.trim();
    if (!trimmedName || !trimmedProgression) {
      setStatus("テンプレート名と進行を入力してください", "error");
      return;
    }

    const nextTemplate: ProgressionTemplate = {
      ...templateDraft,
      id: createTemplateId(),
      category: templateDraft.category.trim() || "カスタム",
      name: trimmedName,
      progression: trimmedProgression,
      description: templateDraft.description.trim(),
    };

    setTemplates((current) => [...current, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
    setEditingTemplateId(nextTemplate.id);
    setTemplateDraft(nextTemplate);
    setStatus("テンプレートを別名保存", "success");
  }

  function overwriteTemplateDraft(): void {
    if (!editingTemplateId) {
      setStatus("上書き対象のテンプレートを編集中にしてください", "error");
      return;
    }

    const trimmedName = templateDraft.name.trim();
    const trimmedProgression = templateDraft.progression.trim();
    if (!trimmedName || !trimmedProgression) {
      setStatus("テンプレート名と進行を入力してください", "error");
      return;
    }

    const nextTemplate: ProgressionTemplate = {
      ...templateDraft,
      id: editingTemplateId,
      category: templateDraft.category.trim() || "カスタム",
      name: trimmedName,
      progression: trimmedProgression,
      description: templateDraft.description.trim(),
    };

    setTemplates((current) => current.map((template) => (template.id === editingTemplateId ? nextTemplate : template)));
    setSelectedTemplateId(nextTemplate.id);
    setTemplateDraft(nextTemplate);
    setStatus("テンプレートを上書き保存", "success");
  }

  function deleteTemplate(templateId: string): void {
    setTemplates((current) => {
      const nextTemplates = current.filter((template) => template.id !== templateId);
      const fallback = nextTemplates[0]?.id ?? "";
      setSelectedTemplateId(fallback);
      return nextTemplates.length > 0 ? nextTemplates : DEFAULT_TEMPLATES;
    });
    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
      setTemplateDraft(createTemplateDraft(project.rawInput));
    }
    setStatus("テンプレートを削除", "success");
  }

  function startNewTemplateDraft(): void {
    setEditingTemplateId(null);
    setTemplateDraft(createTemplateDraft(project.rawInput));
    setStatus("新規テンプレートの編集を開始", "success");
  }

  function startEditingTemplate(templateId: string): void {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      setStatus("編集するテンプレートを選択してください", "error");
      return;
    }

    setEditingTemplateId(template.id);
    setTemplateDraft({ ...template });
    setStatus(`テンプレート「${template.name}」を編集中`, "success");
  }

  function applyTemplate(templateId: string): void {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    runParse(template.progression, project.key, project.mode, project.chordDuration, false, false);
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    window.setTimeout(() => timelineRef.current?.focus(), 0);
    setStatus(`テンプレート「${template.name}」を適用`, "success");
  }

  function addSuggestion(item: SuggestionItem): void {
    const token = project.notationPreference === "roman" ? item.romanNumeral : item.symbol;
    const nextInput = project.rawInput.trim() ? `${project.rawInput.trim()} - ${token}` : token;
    syncProject({
      ...project,
      rawInput: nextInput,
    });
  }

  function replaceSelectedChord(nextChord: ChordBlock): void {
    const nextChords = project.chords.map((chord) => (chord.id === nextChord.id ? nextChord : chord));
    syncProject(
      {
        ...project,
        rawInput: progressionToInput(nextChords, project.notationPreference, project.timeSignature, project.inputSlotsPerBar),
        chords: nextChords,
      },
      true,
    );
    setErrors([]);
    setSelectedChordId(nextChord.id);
  }

  function duplicateSelected(): void {
    if (!selectedChord) return;
    const index = project.chords.findIndex((chord) => chord.id === selectedChord.id);
    const duplicate = { ...selectedChord, id: createChordId() };
    const nextChords = [...project.chords];
    nextChords.splice(index + 1, 0, duplicate);
    updateChords(nextChords, "選択中のコードを複製");
    setSelectedChordId(duplicate.id);
  }

  function deleteSelected(): void {
    if (!selectedChord) return;
    const nextChords = project.chords.filter((chord) => chord.id !== selectedChord.id);
    updateChords(nextChords, "選択中のコードを削除", nextChords.length ? "success" : "neutral");
  }

  function moveSelected(step: -1 | 1): void {
    if (!selectedChord) return;
    const index = project.chords.findIndex((chord) => chord.id === selectedChord.id);
    const targetIndex = index + step;
    if (targetIndex < 0 || targetIndex >= project.chords.length) return;
    const nextChords = [...project.chords];
    const [moved] = nextChords.splice(index, 1);
    nextChords.splice(targetIndex, 0, moved);
    updateChords(nextChords, "コード順を移動");
    setSelectedChordId(moved.id);
  }

  function moveChordById(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    const sourceIndex = project.chords.findIndex((chord) => chord.id === sourceId);
    const targetIndex = project.chords.findIndex((chord) => chord.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const nextChords = [...project.chords];
    const [moved] = nextChords.splice(sourceIndex, 1);
    nextChords.splice(targetIndex, 0, moved);
    updateChords(nextChords, "ドラッグでコード順を移動");
    setSelectedChordId(moved.id);
  }

  function buildChordFromSuggestion(item: SuggestionItem): ChordBlock | null {
      const token = item.symbol;
      const parsed = parseProgression(token, project.key, project.mode, project.chordDuration, project.timeSignature, project.inputSlotsPerBar);
    const chord = parsed.chords[0];
    if (!chord) {
      return null;
    }
    return {
      ...applyInversion(chord, "root"),
      duration: project.chordDuration,
    };
  }

  function insertSuggestionIntoTimeline(item: SuggestionItem, targetChordId?: string): void {
    const nextChord = buildChordFromSuggestion(item);
    if (!nextChord) {
      setStatus("候補コードの追加に失敗", "error");
      return;
    }

    const nextChords = [...project.chords];
    if (!targetChordId) {
      nextChords.push(nextChord);
    } else {
      const targetIndex = nextChords.findIndex((chord) => chord.id === targetChordId);
      if (targetIndex === -1) {
        nextChords.push(nextChord);
      } else {
        nextChords.splice(targetIndex, 0, nextChord);
      }
    }

    updateChords(nextChords, "候補コードを追加");
    setSelectedChordId(nextChord.id);
  }

  function previewSuggestion(item: SuggestionItem): void {
    const chord = buildChordFromSuggestion(item);
    if (!chord) {
      setStatus("コード試聴に失敗", "error");
      return;
    }

    stopPlayback();
      playMidiNotes(voicedMidiNotes(chord), 900);
    setStatus(`${displayLabel(item, project.notationPreference)} を試聴`, "neutral");
  }

  function previewTimelineChord(chord: ChordBlock): void {
    stopPlayback();
    setSelectedChordId(chord.id);
    playMidiNotes(voicedMidiNotes(chord), 900);
    setStatus(`${displayLabel(chord, project.notationPreference)} を試聴`, "neutral");
  }

  function applyDescriptorTransform(token: string, label: string): void {
    if (!selectedChord) return;
    const parsed = parseProgression(token, project.key, project.mode, selectedChord.duration, project.timeSignature, project.inputSlotsPerBar);
    const rebuilt = parsed.chords[0];
    if (!rebuilt) {
      setStatus(`${label} への変換に失敗`, "error");
      return;
    }

    const nextChord = selectedChord.bass
      ? rebuilt
      : applyInversion(
          {
            ...rebuilt,
            id: selectedChord.id,
            duration: selectedChord.duration,
            dotted: selectedChord.dotted,
          },
          selectedChord.inversion ?? "root",
        );

    replaceSelectedChord({
      ...nextChord,
      id: selectedChord.id,
      duration: selectedChord.duration,
      dotted: selectedChord.dotted,
    });
    stopPlayback();
      playMidiNotes(voicedMidiNotes(nextChord), 900);
    setStatus(`${label} に変更`, "success");
  }

  function clearChordAction(): void {
    if (!selectedChord) return;

    const diatonicToken =
      diatonicChords(project.key, project.mode).find((item) => {
        const parsed = parseProgression(item.symbol, project.key, project.mode, selectedChord.duration, project.timeSignature, project.inputSlotsPerBar);
        return parsed.chords[0]?.root === selectedChord.root;
      })?.symbol ?? selectedChord.root;

    applyDescriptorTransform(diatonicToken, "和音操作を解除");
  }

  function applyExtendedChordAction(
    action: "7" | "min7" | "maj7" | "sus2" | "sus4" | "6" | "aug" | "dim" | "m7-5" | "add9" | "9",
  ): void {
    if (!selectedChord) return;

    const isMinorLike =
      selectedChord.quality === "minor" ||
      selectedChord.quality === "minor7" ||
      selectedChord.quality === "minor6" ||
      selectedChord.quality === "minorAdd9";

    let token = `${selectedChord.root}7`;
    if (action === "min7") token = `${selectedChord.root}m7`;
    else if (action === "maj7") token = `${selectedChord.root}maj7`;
    else if (action === "sus2") token = `${selectedChord.root}sus2`;
    else if (action === "sus4") token = `${selectedChord.root}sus4`;
    else if (action === "6") token = `${selectedChord.root}${isMinorLike ? "m6" : "6"}`;
    else if (action === "aug") token = `${selectedChord.root}aug`;
    else if (action === "dim") token = `${selectedChord.root}dim`;
    else if (action === "m7-5") token = `${selectedChord.root}m7b5`;
    else if (action === "add9") token = `${selectedChord.root}${isMinorLike ? "madd9" : "add9"}`;
    else if (action === "9") token = `${selectedChord.root}${isMinorLike ? "m9" : "9"}`;

    applyDescriptorTransform(token, action);
  }

  function transposeAll(semitones: number): void {
    const currentKeyIndex = NOTE_ORDER.indexOf(project.key);
    const nextKey = NOTE_ORDER[(currentKeyIndex + semitones + 12) % 12];
    const nextChords = transposeProgression(project.chords, semitones, nextKey, project.mode);
    syncProject(
      {
        ...project,
        key: nextKey,
          rawInput: progressionToInput(nextChords, project.notationPreference, project.timeSignature, project.inputSlotsPerBar),
        chords: nextChords,
      },
      true,
    );
    setErrors([]);
    setStatus(`全体を${semitones > 0 ? "+" : ""}${semitones}移調`, "success");
  }

  async function saveProjectJson(): Promise<void> {
    try {
      const baseName = sanitizeFilename(project.title, "chord-launchpad-project");
      const path = await save({
        title: "Save Chord Launchpad Project",
        defaultPath: `${baseName}.json`,
        filters: [{ name: "Chord Launchpad Project", extensions: ["json"] }],
      });
      if (!path) {
        setStatus("保存をキャンセル", "neutral");
        return;
      }
      await writeTextFile(path, projectToJson(project));
      setStatus("プロジェクトを保存", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      setStatus(`保存失敗: ${message}`, "error");
    }
  }

  async function openProjectJson(): Promise<void> {
    try {
      const path = await open({
        title: "Open Chord Launchpad Project",
        multiple: false,
        directory: false,
        filters: [{ name: "Chord Launchpad Project", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) {
        setStatus("読み込みをキャンセル", "neutral");
        return;
      }

      const json = await readTextFile(path);
      const nextProject = projectFromJson(json);
      syncProject(nextProject, true, false);
      setErrors([]);
      setSelectedChordId(nextProject.chords[0]?.id ?? null);
      setUndoStack([]);
      setRedoStack([]);
      setStatus("プロジェクトを読み込み", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      setStatus(`読み込み失敗: ${message}`, "error");
    }
  }

  async function exportMidi(): Promise<void> {
    if (project.chords.length === 0) {
      setStatus("書き出すコードがありません", "error");
      return;
    }

    try {
      const baseName = sanitizeFilename(project.title, "chord-launchpad");
      const path = await save({
        title: "Export MIDI",
        defaultPath: `${baseName}.mid`,
        filters: [{ name: "MIDI File", extensions: ["mid"] }],
      });
      if (!path) {
        setStatus("MIDI書き出しをキャンセル", "neutral");
        return;
      }

      const bytes = buildMidiFile(project.chords, project.bpm, project.timeSignature, {
        bassAddition: project.bassAddition,
        openVoicing: project.openVoicing,
      });
      await writeFile(path, bytes);
      setStatus("MIDIを書き出し", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      setStatus(`MIDI書き出し失敗: ${message}`, "error");
    }
  }

  async function startMidiDrag(): Promise<void> {
    if (project.chords.length === 0) {
      setStatus("書き出すコードがありません", "error");
      return;
    }

    try {
      setIsPreparingMidiDrag(true);
      setStatus("D&D 用 MIDI を準備中", "neutral");
      const baseName = sanitizeFilename(project.title, "chord-launchpad");
      const bytes = buildMidiFile(project.chords, project.bpm, project.timeSignature, {
        bassAddition: project.bassAddition,
        openVoicing: project.openVoicing,
      });
      await invoke("start_midi_drag", {
        bytes: Array.from(bytes),
        fileName: `${baseName}.mid`,
      });
      setStatus("MIDI のドラッグを開始", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      setStatus(`D&D 失敗: ${message}`, "error");
    } finally {
      setIsPreparingMidiDrag(false);
    }
  }

  function handleMidiDragPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    if (isPreparingMidiDrag) {
      return;
    }
    void startMidiDrag();
  }

  function suppressButtonSpace(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function blurButtonAfterPointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.currentTarget.blur();
  }

  function commitFieldOnEnter(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function commitTextareaOnCtrlEnter(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function commitInput(rawInput: string): void {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      stopPlayback();
      setErrors([]);
      setSelectedChordId(null);
      syncProject(
        {
          ...project,
          rawInput: "",
          chords: [],
        },
        true,
      );
      inputRef.current?.blur();
      return;
    }

      runParse(rawInput, project.key, project.mode, project.chordDuration, false);
    inputRef.current?.blur();
  }

  function stopPlayback(): void {
    playbackRunIdRef.current += 1;
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
    setIsPlaying(false);
    setPlayheadIndex(null);
  }

  function midiFrequency(noteNumber: number): number {
    return 440 * 2 ** ((noteNumber - 69) / 12);
  }

  function toneLabel(tone: PlaybackTone): string {
    return PLAYBACK_TONE_OPTIONS.find((option) => option.value === tone)?.label ?? "Piano";
  }

  function playMidiNotes(noteNumbers: number[], durationMs: number): void {
    const AudioCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }

    const context = audioContextRef.current;
    const now = context.currentTime;
    const durationSec = durationMs / 1000;

    noteNumbers.forEach((noteNumber, index) => {
      const voiceGain = context.createGain();
      const oscillator = context.createOscillator();
      const detuneOscillator = context.createOscillator();
      const detuneGain = context.createGain();
      const frequency = midiFrequency(noteNumber);

      oscillator.frequency.setValueAtTime(frequency, now);
      detuneOscillator.frequency.setValueAtTime(frequency, now);
      detuneGain.gain.setValueAtTime(0.0001, now);

      if (project.playbackTone === "pad") {
        oscillator.type = index === 0 ? "sawtooth" : "triangle";
        detuneOscillator.type = "sine";
        detuneOscillator.detune.setValueAtTime(index % 2 === 0 ? 6 : -6, now);
        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.linearRampToValueAtTime(0.09, now + 0.18);
        voiceGain.gain.linearRampToValueAtTime(0.06, now + durationSec * 0.6);
        voiceGain.gain.linearRampToValueAtTime(0.0001, now + durationSec + 0.12);
        detuneGain.gain.setValueAtTime(0.018, now);
      } else if (project.playbackTone === "organ") {
        oscillator.type = "square";
        detuneOscillator.type = "sine";
        detuneOscillator.frequency.setValueAtTime(frequency * 2, now);
        voiceGain.gain.setValueAtTime(0.075, now);
        voiceGain.gain.setValueAtTime(0.075, now + durationSec * 0.82);
        voiceGain.gain.linearRampToValueAtTime(0.0001, now + durationSec + 0.04);
        detuneGain.gain.setValueAtTime(0.028, now);
      } else if (project.playbackTone === "pluck") {
        oscillator.type = index === 0 ? "triangle" : "sine";
        detuneOscillator.type = "square";
        detuneOscillator.detune.setValueAtTime(12, now);
        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.16, now + 0.005);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, durationSec * 0.55));
        detuneGain.gain.setValueAtTime(0.012, now);
      } else {
        oscillator.type = index === 0 ? "triangle" : "sine";
        detuneOscillator.type = "triangle";
        detuneOscillator.detune.setValueAtTime(index % 2 === 0 ? 3 : -3, now);
        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        voiceGain.gain.exponentialRampToValueAtTime(0.05, now + 0.14);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
        detuneGain.gain.setValueAtTime(0.01, now);
      }

      oscillator.connect(voiceGain);
      detuneOscillator.connect(detuneGain);
      detuneGain.connect(voiceGain);
      voiceGain.connect(context.destination);
      oscillator.start(now);
      detuneOscillator.start(now);
      oscillator.stop(now + durationSec + 0.2);
      detuneOscillator.stop(now + durationSec + 0.2);
    });
  }

  function voicedMidiNotes(chord: ChordBlock): number[] {
    return midiNoteNumbers(chord, {
      bassAddition: project.bassAddition,
      openVoicing: project.openVoicing,
    });
  }

  function startPlayback(): void {
    if (project.chords.length === 0) {
      setStatus("再生するコードがありません", "error");
      return;
    }

    stopPlayback();
    const runId = playbackRunIdRef.current;
    setIsPlaying(true);

    const beatMs = (60 / project.bpm) * 1000;
    let elapsed = 0;

    project.chords.forEach((chord, index) => {
      const durationBeats = chordDurationBeats(chord.duration, project.timeSignature, chord.dotted);
      const durationMs = durationBeats * beatMs;
      const timerId = window.setTimeout(() => {
        if (playbackRunIdRef.current !== runId) return;
        setPlayheadIndex(index);
          playMidiNotes(voicedMidiNotes(chord), durationMs * 0.92);
      }, elapsed);
      timersRef.current.push(timerId);
      elapsed += durationMs;
    });

    const stopTimerId = window.setTimeout(() => {
      if (playbackRunIdRef.current !== runId) return;
      if (loopEnabledRef.current) {
        startPlayback();
        return;
      }
      setIsPlaying(false);
      setPlayheadIndex(null);
    }, elapsed);

    timersRef.current.push(stopTimerId);
  }

  function hintText(): string {
    if (project.chords.length === 0) {
      return "コードを入力すると、自動で進行に反映されます。";
    }

    const lastChord = project.chords[project.chords.length - 1];
    if (lastChord.romanNumeral.startsWith("V") || lastChord.romanNumeral.startsWith("v")) {
      return "最後が V 系なので、次に I へ進むと解決感が強くなります。";
    }
    if (lastChord.romanNumeral.toLowerCase().startsWith("vi")) {
      return "vi で終わっているので、IV や V に向かうと流れを作りやすいです。";
    }
    if (hasRomanInput) {
      return "ディグリー入力なので、Key と Mode を変えても役割を保ったまま再配置できます。";
    }
    return "コード入力でも解析後はディグリー基準で保持されるので、Key を変えると再配置されます。";
  }

  function toggleLoopEnabled(): void {
    setLoopEnabled((value) => {
      const next = !value;
      setStatus(next ? "ループをオン" : "ループをオフ", "neutral");
      return next;
    });
  }

  function resetProject(): void {
    stopPlayback();
    localStorage.removeItem(STORAGE_KEY);
    const nextProject = createInitialProject();
    syncProject(nextProject, true, false);
    setErrors([]);
    setSelectedChordId(nextProject.chords[0]?.id ?? null);
    setUndoStack([]);
    setRedoStack([]);
    setStatus("新規プロジェクト", "neutral");
  }

  return (
    <div className="app-shell">
      <header className="title-bar surface compact-surface">
        <div className="title-left">
          <div>
          <p className="eyebrow">Chord Launchpad</p>
          <input
            className="title-input"
            type="text"
            value={project.title}
            aria-label="Project title"
            onChange={(event) => updateProjectMeta("title", event.target.value)}
            onKeyDown={commitFieldOnEnter}
          />
          </div>
          <div className="title-actions title-actions-left">
            <button type="button" className="ghost-button compact-button icon-only-button" onClick={resetProject} title="新規 (Ctrl+N)">
              <span aria-hidden="true">＋</span>
            </button>
            <button type="button" className="ghost-button compact-button icon-only-button" onClick={openProjectJson} title="開く (Ctrl+O)">
              <span aria-hidden="true">📂</span>
            </button>
            <button type="button" className="ghost-button compact-button icon-only-button" onClick={saveProjectJson} title="保存 (Ctrl+S)">
              <span aria-hidden="true">💾</span>
            </button>
          </div>
        </div>
        <div className="title-actions title-actions-center playback-actions">
          <div className="display-group playback-meta-group">
            <div className="display-block playback-scale-block">
              <span className="display-label">スケール</span>
              <div className="display-row scale-row">
                <select value={project.key} onChange={(event) => updateProjectMeta("key", event.target.value)}>
                  {NOTE_ORDER.map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
                <select
                  value={project.mode}
                  onChange={(event) => updateProjectMeta("mode", event.target.value as MusicalMode)}
                >
                  <option value="major">メジャー</option>
                  <option value="minor">マイナー</option>
                </select>
              </div>
            </div>
            <label className="display-block playback-bpm-block">
              <span className="display-label">BPM</span>
              <input
              type="number"
              min="60"
              max="220"
              value={project.bpm}
              onChange={(event) => updateProjectMeta("bpm", Number(event.target.value) || 120)}
              onKeyDown={commitFieldOnEnter}
            />
          </label>
          </div>
          <div className="playback-buttons">
            <button
              type="button"
              className="primary-button icon-only-button transport-main-button"
              onClick={startPlayback}
              onKeyDown={suppressButtonSpace}
              onPointerUp={blurButtonAfterPointerUp}
              title="再生"
            >
              <span aria-hidden="true">▶</span>
            </button>
            <button
              type="button"
              className="ghost-button icon-only-button transport-main-button"
              onClick={stopPlayback}
              onKeyDown={suppressButtonSpace}
              onPointerUp={blurButtonAfterPointerUp}
              title="停止"
            >
              <span aria-hidden="true">■</span>
            </button>
            <button
              type="button"
              className={`ghost-button icon-only-button transport-main-button${loopEnabled ? " active-button" : ""}`}
              onClick={toggleLoopEnabled}
              onKeyDown={suppressButtonSpace}
              onPointerUp={blurButtonAfterPointerUp}
              title="ループ"
              aria-pressed={loopEnabled}
            >
              <span aria-hidden="true">↻</span>
            </button>
          </div>
        </div>
        <div className="title-actions title-actions-right">
          <div className="history-actions">
          <button type="button" className="ghost-button compact-button icon-only-button" onClick={undoProjectChange} disabled={undoStack.length === 0} title="元に戻す (Ctrl+Z)">
            <span aria-hidden="true">↶</span>
          </button>
          <button type="button" className="ghost-button compact-button icon-only-button" onClick={redoProjectChange} disabled={redoStack.length === 0} title="やり直す (Ctrl+Y)">
            <span aria-hidden="true">↷</span>
          </button>
          </div>
          <button type="button" className="primary-button compact-button icon-only-button midi-button" onClick={exportMidi} title="MIDI書き出し (Ctrl+E)">
            <span aria-hidden="true">♫</span>
          </button>
          <button
            type="button"
            className="ghost-button compact-button icon-only-button drag-export-button"
            onPointerDown={handleMidiDragPointerDown}
            disabled={isPreparingMidiDrag || project.chords.length === 0}
            title="ドラッグして DAW に渡す"
          >
            <span aria-hidden="true">{isPreparingMidiDrag ? "…" : "⇱"}</span>
          </button>
          <button
            type="button"
            className="ghost-button compact-button icon-only-button help-button"
            onClick={openWebHelpPlaceholder}
            title="Webヘルプ"
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
      </header>

      <section className="transport-bar surface compact-surface">
        <div className="transport-fields">
          <label className="display-block transport-display-block">
            <span className="display-label">拍子</span>
            <select
              value={project.timeSignature}
              onChange={(event) => updateProjectMeta("timeSignature", event.target.value as TimeSignature)}
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
            </select>
          </label>
          <label className="display-block transport-display-block">
            <span className="display-label">スロット</span>
            <select
              value={project.inputSlotsPerBar}
              onChange={(event) => updateProjectMeta("inputSlotsPerBar", Number(event.target.value) as InputSlotsPerBar)}
            >
              {SLOT_OPTIONS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
          <label className="display-block transport-display-block">
            <span className="display-label">既定長</span>
            <select
              value={project.chordDuration}
              onChange={(event) => updateProjectMeta("chordDuration", event.target.value as ChordDuration)}
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="display-block transport-display-block">
            <span className="display-label">優先表示</span>
            <select
              value={project.notationPreference}
              onChange={(event) => updateProjectMeta("notationPreference", event.target.value as NotationPreference)}
            >
              <option value="roman">ディグリー</option>
                <option value="symbol">コード</option>
              </select>
            </label>
            <label className="display-block transport-display-block">
              <span className="display-label">音色</span>
              <select
                value={project.playbackTone}
                onChange={(event) => updateProjectMeta("playbackTone", event.target.value as PlaybackTone)}
              >
                {PLAYBACK_TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="display-block transport-display-block">
              <span className="display-label">ベース</span>
              <select
                value={project.bassAddition}
                onChange={(event) => updateProjectMeta("bassAddition", event.target.value as BassAdditionMode)}
              >
                {BASS_ADDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="display-block transport-display-block">
              <span className="display-label">開き</span>
              <select
                value={project.openVoicing}
                onChange={(event) => updateProjectMeta("openVoicing", event.target.value as OpenVoicingMode)}
              >
                {OPEN_VOICING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="display-block transport-display-block">
              <span className="display-label">操作</span>
            <div className="timeline-actions-row">
              <button type="button" className="ghost-button compact-button icon-button action-text-button" onClick={duplicateSelected} disabled={!selectedChord} title="複製">
                <span aria-hidden="true">⧉</span>
                <span>複製</span>
              </button>
              <button type="button" className="ghost-button compact-button icon-button action-text-button" onClick={deleteSelected} disabled={!selectedChord} title="削除">
                <span aria-hidden="true">✕</span>
                <span>削除</span>
              </button>
              <button type="button" className="ghost-button compact-button icon-only-button" onClick={() => moveSelected(-1)} disabled={!selectedChord} title="左へ">
                <span aria-hidden="true">←</span>
              </button>
              <button type="button" className="ghost-button compact-button icon-only-button" onClick={() => moveSelected(1)} disabled={!selectedChord} title="右へ">
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <label className="display-block transport-display-block">
            <span className="display-label">転回</span>
            <select
              value={selectedChord?.bass ? "root" : selectedChord?.inversion ?? "root"}
              onChange={(event) => updateSelectedInversion(event.target.value as StylePreset)}
              disabled={!selectedChord || Boolean(selectedChord?.bass)}
            >
              <option value="root">基本</option>
              <option value="1st">1転</option>
              <option value="2nd">2転</option>
              <option value="3rd">3転</option>
            </select>
          </label>
          <div className="display-block transport-display-block">
            <span className="display-label">付点</span>
            <button
              type="button"
              className={`ghost-button compact-button dotted-toggle${selectedChord?.dotted ? " active-button" : ""}`}
              onClick={toggleSelectedDotted}
              disabled={!selectedChord}
            >
              ・
            </button>
          </div>
        </div>
        <div className="transport-tools">
          <div className="transport-tool-group">
            <div className="display-block transport-display-block transport-inline-box chord-pad-shell">
              <span className="display-label">和音操作</span>
              <button
                type="button"
                className={`ghost-button compact-button chord-pad-toggle${showChordPad ? " active-button" : ""}`}
                onClick={() => setShowChordPad((value) => !value)}
                disabled={!selectedChord}
              >
                {showChordPad ? "閉じる" : "開く"}
              </button>
              {showChordPad ? (
                <div className="chord-pad-popover">
                  <div className="transform-pad-grid">
                    <button type="button" className="ghost-button compact-button transform-pad clear-pad" onClick={clearChordAction} disabled={!selectedChord}>
                      解除
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("7")} disabled={!selectedChord}>
                      7
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("min7")} disabled={!selectedChord}>
                      min7
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("maj7")} disabled={!selectedChord}>
                      maj7
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("sus2")} disabled={!selectedChord}>
                      sus2
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("sus4")} disabled={!selectedChord}>
                      sus4
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("6")} disabled={!selectedChord}>
                      6
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("aug")} disabled={!selectedChord}>
                      aug
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("dim")} disabled={!selectedChord}>
                      dim
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("m7-5")} disabled={!selectedChord}>
                      m7-5
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("add9")} disabled={!selectedChord}>
                      add9
                    </button>
                    <button type="button" className="ghost-button compact-button transform-pad" onClick={() => applyExtendedChordAction("9")} disabled={!selectedChord}>
                      9
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="transport-tool-group transport-tool-group-narrow">
            <div className="display-block transport-display-block transport-inline-box">
              <span className="display-label">移調</span>
              <div className="transpose-row">
                <button type="button" className="ghost-button compact-button icon-only-button" onClick={() => transposeAll(2)} disabled={project.chords.length === 0} title="上へ移調">
                  <span aria-hidden="true">＋</span>
                </button>
                <button type="button" className="ghost-button compact-button icon-only-button" onClick={() => transposeAll(-2)} disabled={project.chords.length === 0} title="下へ移調">
                  <span aria-hidden="true">－</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="workspace compact-workspace">
        <aside className="panel-stack left-column">
          <section className="card surface compact-card collapsible-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Input</p>
                <h2>入力</h2>
              </div>
              <button type="button" className="ghost-button compact-button" onClick={() => toggleSection("input")}>
                {collapsed.input ? "開く" : "閉じる"}
              </button>
            </div>
            {!collapsed.input ? (
              <>
                <textarea
                  ref={inputRef}
                  className="chord-input compact-input"
                  value={inputDraft}
                  aria-label="Chord progression input"
                  onChange={(event) => setInputDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.ctrlKey) {
                      event.preventDefault();
                      commitInput(inputDraft);
                    }
                  }}
                />
                <p className="helper-text helper-tight">Ctrl+Enter で反映</p>
                {errors.length > 0 ? (
                  <ul className="error-list compact-errors">
                    {errors.map((error) => (
                      <li key={`${error.token}-${error.message}`}>
                        <code>{error.token}</code> {error.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="card surface compact-card collapsible-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Templates</p>
                <h2>テンプレート</h2>
              </div>
              <button type="button" className="ghost-button compact-button" onClick={() => toggleSection("templates")}>
                {collapsed.templates ? "開く" : "閉じる"}
              </button>
            </div>
            {!collapsed.templates ? (
              <div className="template-picker">
                <select
                  className="template-select"
                  size={8}
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  onDoubleClick={(event) => applyTemplate(event.currentTarget.value)}
                >
                  {Array.from(new Set(templates.map((template) => template.category))).map((category) => (
                    <optgroup key={category} label={category}>
                      {templates.filter((template) => template.category === category).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} | {template.progression}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button compact-button"
                  onClick={() => selectedTemplate && applyTemplate(selectedTemplate.id)}
                  disabled={!selectedTemplate}
                >
                  適用
                </button>
                <div className="button-row compact-actions template-picker-actions">
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => selectedTemplate && startEditingTemplate(selectedTemplate.id)}
                    disabled={!selectedTemplate}
                  >
                    編集
                  </button>
                  <button type="button" className="ghost-button compact-button" onClick={startNewTemplateDraft}>
                    新規作成
                  </button>
                </div>
                <div className="template-editor-panel">
                  <p className="eyebrow">Template Editor</p>
                  <p className="helper-text template-editor-state">
                    {editingTemplateId ? `編集中: ${templateDraft.name || "名称未設定"}` : "新規テンプレート作成中"}
                  </p>
                  <div className="template-editor">
                    <label>
                      <span>カテゴリ</span>
                      <input
                        type="text"
                        value={templateDraft.category}
                        onChange={(event) => updateTemplateDraft("category", event.target.value)}
                        onKeyDown={commitFieldOnEnter}
                      />
                    </label>
                    <label>
                      <span>名前</span>
                      <input
                        type="text"
                        value={templateDraft.name}
                        onChange={(event) => updateTemplateDraft("name", event.target.value)}
                        onKeyDown={commitFieldOnEnter}
                      />
                    </label>
                    <label>
                      <span>進行</span>
                      <textarea
                        className="template-progression-input"
                        value={templateDraft.progression}
                        onChange={(event) => updateTemplateDraft("progression", event.target.value)}
                        onKeyDown={commitTextareaOnCtrlEnter}
                      />
                    </label>
                    <label>
                      <span>説明</span>
                      <input
                        type="text"
                        value={templateDraft.description}
                        onChange={(event) => updateTemplateDraft("description", event.target.value)}
                        onKeyDown={commitFieldOnEnter}
                      />
                    </label>
                    <div className="button-row compact-actions">
                      <button type="button" className="ghost-button compact-button" onClick={() => loadTemplateDraftFromProgression(project.rawInput, "入力")}>
                        入力読込
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                          onClick={() =>
                            loadTemplateDraftFromProgression(
                              progressionToInput(project.chords, project.notationPreference, project.timeSignature, project.inputSlotsPerBar),
                              "進行",
                            )
                          }
                        disabled={project.chords.length === 0}
                      >
                        進行読込
                      </button>
                      <button type="button" className="primary-button compact-button" onClick={saveTemplateAsNew}>
                        別名保存
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={overwriteTemplateDraft}
                        disabled={!editingTemplateId}
                      >
                        上書き保存
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => editingTemplateId && deleteTemplate(editingTemplateId)}
                        disabled={!editingTemplateId}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
                {selectedTemplate ? (
                  <div className="list-item template-item compact-list-item">
                    <div>
                      <strong>{selectedTemplate.name}</strong>
                      <p>{selectedTemplate.progression}</p>
                    </div>
                    <span>{selectedTemplate.description}</span>
                    <span className="helper-text">ダブルクリックで適用</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </aside>

        <section className="panel-stack center-column">
          <section className="card surface compact-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Timeline</p>
                <h2>進行</h2>
              </div>
              <div className="button-row compact-actions">
                <button type="button" className="ghost-button compact-button" onClick={clearProgression} title="クリア">
                  クリア
                </button>
                <span className={`status-badge ${statusTone}`}>{project.chords.length} 個</span>
              </div>
            </div>
            <div
              ref={timelineRef}
              tabIndex={-1}
              className={`timeline compact-timeline${isTimelineDragTarget ? " timeline-drop-target" : ""}`}
              onPointerEnter={() => {
                if (draggingPaletteItem) {
                  setIsTimelineDragTarget(true);
                }
              }}
              onPointerLeave={() => {
                if (draggingPaletteItem) {
                  setIsTimelineDragTarget(false);
                }
              }}
              onPointerUp={() => {
                if (draggingPaletteItem) {
                  insertSuggestionIntoTimeline(draggingPaletteItem);
                  setDraggingPaletteItem(null);
                  setIsTimelineDragTarget(false);
                }
              }}
            >
              {project.chords.map((chord, index) => (
                <div
                  key={chord.id}
                  role="button"
                  tabIndex={0}
                  className={`timeline-card${chord.id === selectedChordId ? " selected" : ""}${playheadIndex === index ? " playing" : ""}${
                    draggingChordId === chord.id ? " dragging" : ""
                  }${dragOverChordId === chord.id ? " drag-over" : ""}${autoBarIndexes.has(index) ? " bar-after" : ""}`}
                  onClick={() => previewTimelineChord(chord)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("button")) {
                      return;
                    }
                    event.preventDefault();
                    setDraggingChordId(chord.id);
                    setDragOverChordId(chord.id);
                    setSelectedChordId(chord.id);
                  }}
                  onPointerEnter={() => {
                    if (!draggingChordId || draggingChordId === chord.id) return;
                    setDragOverChordId(chord.id);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    if (draggingPaletteItem) {
                      insertSuggestionIntoTimeline(draggingPaletteItem, chord.id);
                      setDraggingPaletteItem(null);
                      setIsTimelineDragTarget(false);
                    } else if (draggingChordId && draggingChordId !== chord.id) {
                      moveChordById(draggingChordId, chord.id);
                    } else if (draggingChordId === chord.id) {
                      previewTimelineChord(chord);
                    }
                    setDraggingChordId(null);
                    setDragOverChordId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      previewTimelineChord(chord);
                      return;
                    }

                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      event.stopPropagation();
                      const previousChord = project.chords[index - 1];
                      if (previousChord) {
                        previewTimelineChord(previousChord);
                      }
                      return;
                    }

                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      event.stopPropagation();
                      const nextChord = project.chords[index + 1];
                      if (nextChord) {
                        previewTimelineChord(nextChord);
                      }
                    }
                  }}
                >
                  <p className="timeline-symbol">{displayLabel(chord, project.notationPreference)}</p>
                  <p className="timeline-degree">{secondaryLabel(chord, project.notationPreference)}</p>
                  {chord.id === selectedChordId ? (
                    <div
                      className="timeline-card-controls"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                        <div className="timeline-card-meta timeline-card-meta-only">
                          <select
                            className="timeline-duration-select"
                            value={chord.duration}
                            onChange={(event) => {
                              setSelectedChordId(chord.id);
                              updateSelectedDuration(event.target.value as ChordDuration);
                            }}
                          >
                            {durationOptionsForChord.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                      </div>
                    </div>
                    ) : (
                      <p className="timeline-duration">
                        {durationLabel(chord.duration, chord.dotted)}
                      </p>
                    )}
                </div>
              ))}
              {project.chords.length === 0 ? (
                <div
                  className={`timeline-empty${isTimelineDragTarget ? " timeline-empty-active" : ""}`}
                  onPointerEnter={() => {
                    if (draggingPaletteItem) {
                      setIsTimelineDragTarget(true);
                    }
                  }}
                  onPointerLeave={() => {
                    if (draggingPaletteItem) {
                      setIsTimelineDragTarget(false);
                    }
                  }}
                  onPointerUp={() => {
                    if (draggingPaletteItem) {
                      insertSuggestionIntoTimeline(draggingPaletteItem);
                      setDraggingPaletteItem(null);
                      setIsTimelineDragTarget(false);
                    }
                  }}
                >
                  コードをここへ追加
                </div>
              ) : null}
            </div>
          </section>

          <section className="card surface compact-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Inspector</p>
                <h2>インスペクタ</h2>
              </div>
            </div>
            {inspectorChord ? (
              <div className="inspector-grid compact-inspector-grid">
                <div className="info-block compact-info-block info-primary-block">
                  <span>コード / ディグリー</span>
                  <strong>
                    {inspectorChord.symbol}
                    {" / "}
                    {inspectorChord.romanNumeral}
                  </strong>
                </div>
                  <div className="info-block compact-info-block info-compact-block">
                    <span>長さ</span>
                    <strong>
                      {durationLabel(inspectorChord.duration, inspectorChord.dotted)}
                    </strong>
                  </div>
                <div className="info-block compact-info-block info-compact-block">
                  <span>転回形</span>
                  <strong>
                    {inspectorChord.bass
                      ? `${inspectorChord.symbol} / ベース優先`
                      : inspectorChord.inversion === "1st"
                        ? "1転"
                        : inspectorChord.inversion === "2nd"
                          ? "2転"
                          : inspectorChord.inversion === "3rd"
                            ? "3転"
                            : "基本"}
                  </strong>
                </div>
                <div className="info-block compact-info-block info-notes-block">
                  <span>構成音</span>
                  <strong>{inspectorChord.notes.length > 0 ? inspectorChord.notes.join(" ") : "—"}</strong>
                </div>
                {inspectorChord.bass ? (
                  <div className="info-block compact-info-block">
                    <span>ベース</span>
                    <strong>{inspectorChord.bass}</strong>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="tip-copy">コードを選択すると内容が表示されます。</p>
            )}
          </section>
        </section>

        <aside className="panel-stack right-column">
          <section className="card surface compact-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Guide</p>
                <h2>コード</h2>
              </div>
            </div>
            <div className="pill-row compact-pill-row">
              {keyGuide.map((chord) => (
                <button
                  key={`${chord.symbol}-${chord.romanNumeral}`}
                  type="button"
                  className={`pill-button compact-pill-button dual-pill-button${draggingPaletteItem?.symbol === chord.symbol && draggingPaletteItem?.romanNumeral === chord.romanNumeral ? " dragging-pill" : ""}`}
                  onClick={() => previewSuggestion(chord)}
                  onDoubleClick={() => insertSuggestionIntoTimeline(chord)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    setDraggingPaletteItem(chord);
                  }}
                >
                  <strong>{displayLabel(chord, project.notationPreference)}</strong>
                  <small>{secondaryLabel(chord, project.notationPreference)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card surface compact-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Suggestions</p>
                <h2>次候補</h2>
              </div>
            </div>
            <div className="pill-row compact-pill-row">
              {suggestions.map((chord) => (
                <button
                  key={`${chord.symbol}-${chord.romanNumeral}`}
                  type="button"
                  className={`pill-button compact-pill-button dual-pill-button${draggingPaletteItem?.symbol === chord.symbol && draggingPaletteItem?.romanNumeral === chord.romanNumeral ? " dragging-pill" : ""}`}
                  onClick={() => previewSuggestion(chord)}
                  onDoubleClick={() => addSuggestion(chord)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    setDraggingPaletteItem(chord);
                  }}
                >
                  <strong>{displayLabel(chord, project.notationPreference)}</strong>
                  <small>{secondaryLabel(chord, project.notationPreference)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="card surface compact-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Tip</p>
                <h2>ヒント</h2>
              </div>
            </div>
            <p className="tip-copy">{hintText()}</p>
          </section>
        </aside>
      </main>

      <footer className="status-bar surface compact-surface">
        <div className="bottom-status slim-status">
          <span>{project.chords.length} コード</span>
          <span>{project.key} / {project.mode === "major" ? "Major" : "Minor"}</span>
          <span>{isPlaying ? "再生中" : "プレビュー待機"}</span>
          <span>{statusMessage}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
