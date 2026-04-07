# Chord Draft コマンド表

## 入力形式
| 種別 | 例 | 説明 |
| --- | --- | --- |
| コード | `C G Am F` | 通常コード入力 |
| ディグリー | `I V vi IV` | ローマ数字入力 |
| 数字 | `1 5 6 4` | 現在のスケール基準 |
| 分数コード | `C/E` | ベース指定 |
| 小節区切り | `|` | 小節線 |
| 保持 | `-` | 前コードを保持 |
| 繰り返し | `%` / `=` | 直前コードを繰り返し |
| 明示長 | `F(3/8)` | 変則長さ |

## 数字入力接尾辞
| 入力 | 意味 |
| --- | --- |
| `m` | minor |
| `M` | major |
| `hdm` / `m75` | half diminished |
| `six` / `6` | sixth |
| `svn` / `7` | seventh |
| `mis` / `m7` | minor seventh |
| `mas` / `M7` | major seventh |
| `adn` / `add9` | add9 |
| `sut` / `sus2` | sus2 |
| `suf` / `sus4` | sus4 |

## 和音操作
| ボタン | 変化 |
| --- | --- |
| `解除` | ダイアトニックへ戻す |
| `7` | 7th |
| `min7` | minor 7th |
| `maj7` | major 7th |
| `sus2` | sus2 |
| `sus4` | sus4 |
| `6` | sixth |
| `aug` | augmented |
| `dim` | diminished |
| `m7-5` | half diminished |
| `add9` | add9 |
| `9` | ninth |

## ショートカット
| キー | 動作 |
| --- | --- |
| `Ctrl+Enter` | 入力欄を反映 |
| `Ctrl+N` | 新規 |
| `Ctrl+O` | 開く |
| `Ctrl+S` | 保存 |
| `Ctrl+E` | MIDI 書き出し |
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Y` | やり直す |
| `Ctrl+Shift+Z` | やり直す |
| `Space` | 再生 / 停止 |
| `Ctrl+← / Ctrl+→` | 選択コード移動 |
| `Alt+← / Alt+→` | 長さ変更 |
| `Alt+↑ / Alt+↓` | 転回変更 |
| `Alt+.` | 付点切替 |
| `Delete` / `Backspace` | 削除 |
