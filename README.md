# ChordLaunchpad

![CL-Pre.png](https://github.com/stellorbit/ChordLaunchpad/blob/main/CL-Pre.png)

**多機能コード進行作成支援ソフト**

## 免責事項

このアプリケーションはプレビュー版です。
当ソフトウェアによって発生した不利益・損害などの責任は負いません。

## 生成AI使用表明

このアプリケーションは、Codex(GPT-5.4)を使用し生成されたものです。
動作不良・脆弱性などの問題はチェック済みですが、あくまで生成AIによって作成されたものであることをご留意ください。

## 既知の不具合・未実装機能

・「？」ボタンはWebヘルプへのリンク用ですが、現在はダミーです。

## 主要機能

### テキスト入力によるコード作成

- コード表記入力
- ディグリーネーム入力（大文字・小文字区別、大文字＋マイナー対応）

#### アラビア数字入力

アラビア数字＋コマンドでの入力にも対応しています。
[COMMAND_TABLE_ja.md](./docs/COMMAND_TABLE_ja.md)の「数字入力接尾辞」にコマンド一覧があります。
例
`1 5 6 4` = C G Am F
`4mas 3svn 6mis 1svn` = Fmaj7 E7 Am7 C7

### 日本語の利用ガイド:
- [docs/USER_GUIDE_ja.md](./docs/USER_GUIDE_ja.md)
- [docs/APP_GUIDE_ja.md](./docs/APP_GUIDE_ja.md)
- [docs/COMMAND_TABLE_ja.md](./docs/COMMAND_TABLE_ja.md)
- [docs/CHEATSHEET_ja.md](./docs/CHEATSHEET_ja.md)
- [docs/PREVIEW_RELEASE_ja.md](./docs/PREVIEW_RELEASE_ja.md)

## Preview 配布方針

現在の preview 配布は Windows 版のみです。

- GitHub Actions のコストを抑えるため
- macOS 実機での検証ができないため
- まずは Windows 版の品質を優先するため

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
