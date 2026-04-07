import type { ProgressionTemplate } from "../types/music";

export const DEFAULT_TEMPLATES: ProgressionTemplate[] = [
  {
    id: "classic-pop",
    category: "定番",
    name: "王道進行",
    progression: "I V vi IV",
    description: "最も使いやすい定番ループ",
  },
  {
    id: "sensitive-pop",
    category: "定番",
    name: "切ない進行",
    progression: "vi IV I V",
    description: "少し切ない雰囲気を作りやすい",
  },
  {
    id: "basic-cadence",
    category: "定番",
    name: "基本終止",
    progression: "I IV V I",
    description: "安定した解決感のある基本形",
  },
  {
    id: "canon",
    category: "定番",
    name: "カノン進行",
    progression: "I V vi iii IV I IV V",
    description: "広く使われる定番の長い進行",
  },
  {
    id: "two-five-one",
    category: "定番",
    name: "II-V-I",
    progression: "ii V I",
    description: "ジャズやポップスで定番の解決進行",
  },
  {
    id: "cycle",
    category: "定番",
    name: "循環進行",
    progression: "I VI ii V",
    description: "回り続ける流れを作りやすい",
  },
  {
    id: "minor-loop",
    category: "定番",
    name: "マイナーループ",
    progression: "i VI III VII",
    description: "マイナーで扱いやすい基本ループ",
  },
];
