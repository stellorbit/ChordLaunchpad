# Preview Release 手順

Chord Launchpad の preview バイナリを GitHub Releases に上げるためのメモです。

## 何が作られるか

この設定では、GitHub Actions で次の preview ビルドを作成します。

- Windows x64

生成物は **Draft + Prerelease** の GitHub Release にアップロードされます。

## 追加したファイル

- `.github/workflows/preview-release.yml`

## 実行方法

### 方法1: Actions から手動実行

1. GitHub の `Actions` タブを開く
2. `preview-release` を選ぶ
3. `Run workflow` を押す

### 方法2: タグ push

`preview-v*` のタグ push でも起動します。

例:

```powershell
git tag preview-v0.1.0
git push origin preview-v0.1.0
```

## 出力される Release

ワークフローは次の形式で Draft Release を作ります。

- Tag: `preview-v__VERSION__`
- Release name: `Chord Launchpad Preview v__VERSION__`

`__VERSION__` は Tauri / package version から自動置換されます。

## 事前確認

### GitHub Actions の権限

Tauri 公式 docs でも案内されている通り、`GITHUB_TOKEN` が Release を作成できるよう、リポジトリ設定で Actions の権限を **Read and write permissions** にしておく必要があります。

参考:
- [Tauri GitHub Pipeline](https://v2.tauri.app/ja/distribute/pipelines/github/)
- [tauri-action README](https://github.com/tauri-apps/tauri-action)

## 現在の方針

現時点の preview 配布は **Windows 版のみ** です。

理由:

- GitHub Actions の実行コストを抑えるため
- macOS 実機での動作確認が前提になるため
- まずは Windows 版の品質を優先するため

## 補足

現在の workflow は `npm ci` を使います。  
そのため、リポジトリに `package-lock.json` がある前提です。
