# 🎙️ Minimal Pod Studio

ポッドキャストの**収録 → 編集 → 書き出し → 投稿補助**までをブラウザだけで完結させるツールです。
サーバー不要・完全クライアントサイド動作（音声データはPCの外に出ません。文字起こしをLLM APIで行う場合のみ音声を送信します）。

> 編集専用ツール [MinimalPodPrep](https://github.com/KzoNag/MinimalPodPrep) の後継です。

## できること

| 機能 | 内容 |
|---|---|
| 収録 | 自分のマイク音声と、Discord等の相手の音声（システム音声）を**別トラックで同時録音** |
| ファイル読み込み | 録音済みの音声ファイル（1〜2トラック）を読み込んで、**編集以降だけ**行うことも可能 |
| クラッシュ復元 | 録音データは1秒ごとにIndexedDBへ自動保存。ブラウザが落ちても復元可能 |
| 音量調整 | 各トラックのラウドネスを解析して自動でバランス調整（手動微調整も可） |
| トリミング | 波形を見ながら冒頭・末尾をドラッグでカット。ホイール/ピンチでズーム、横スクロール・ミニマップで長時間収録も快適に移動（数値指定・マーカー対応） |
| BGM | 冒頭は本編と同程度の音量 → イントロ後にダッキング → 本編終了で復帰 → アウトロ → フェードアウト。ループ再生対応 |
| プレビュー | ダッキング込みの完成形をその場で再生確認 |
| 書き出し | MP3 (96/128/192kbps) / WAV。ブラウザ内でエンコード（Web Worker） |
| 文字起こし | Gemini / OpenAI Whisper（**初期状態はモック**。APIキー設定で有効化） |
| 説明文生成 | タイトルは `{title}` プレースホルダー方式。説明文はテンプレートを**雛形としてLLMが全体を生成**（`{summary}` 等の穴埋めや「カジュアルな口調で」等の指示文も利用可） |
| 投稿補助 | Spotify for Creators の新規エピソード画面を開く+タイトル/説明文コピー |

## 必要環境

- **Chrome / Edge 最新版**（システム音声の取得に `getDisplayMedia` の音声共有が必要なため。Safari / Firefox は不可）
- Node.js 18+（開発サーバー起動用）
- メモリ 8GB 以上推奨（60分収録の編集・書き出し時に一時的に2〜3GB使用します）

## 起動方法

```bash
npm install
npm run dev      # → http://localhost:5173
```

配布用ビルド（`dist/` を任意の静的ホスティングに置くか、ローカルで `npm run preview`）:

```bash
npm run build
```

## 使い方（収録の流れ）

1. **Discord等で通話を開始**（通話自体は普段のツールで）
2. 🎧 **ヘッドホンを装着**（スピーカーだと相手の声がマイクに回り込みます）
3. アプリで「**マイクを有効化**」→ レベルメーターで入力確認
4. 「**画面共有で取得**」→ Chromeのダイアログで「**画面全体**」＋「**システム音声も共有**」をON
   - これで Discord アプリから聞こえる相手の声が別トラックで録音されます
   - ブラウザ版 Discord の場合はそのタブを選んで「タブの音声も共有」でもOK
5. 「**● 収録開始**」。トピックの切り替わりなどで「🚩 マーカー」を打っておくと編集が楽です
6. 「**■ 収録終了**」→ 自動で編集画面へ
7. 波形で冒頭・末尾をトリミング、音量バランス確認、BGMファイルを読み込んで各パラメータを調整
8. 仕上げ画面で **MP3書き出し → 文字起こし → 説明文生成 → Spotifyへ投稿**

> 💡 初めての方は収録画面下部の「**デモデータで編集画面を試す**」で、録音せずに編集〜書き出しを体験できます。

### macOS でシステム音声が取れない場合

「システム音声も共有」のチェックが出ない/グレーアウトする場合:

- Chrome を最新版に更新する（macOS 13 以降でシステム音声共有に対応）
- **代替案1**: Discord をブラウザ（Chromeタブ）で開き、そのタブを「タブの音声も共有」付きで共有する（確実・推奨）
- **代替案2**: [BlackHole](https://existential.audio/blackhole/) 等の仮想オーディオデバイスを入れ、Discordの出力をBlackHoleへ→アプリのマイク選択とは別にシステム側でルーティングする（上級者向け）

### 収録品質のヒント

- マイクの「エコーキャンセル」はヘッドホン使用時はOFF推奨（音質が上がります）。スピーカー使用時のみON
- 収録開始直後に数秒静かにしておくと、トリミングで頭出ししやすくなります
- Discord側の音声処理（ノイズ抑制等）は入れたままでOK

## LLM の設定と費用試算

初期状態は**モック**（APIキー不要、ダミー応答）です。⚙️ 設定からプロバイダとAPIキーを登録すると実際に動作します。キーはブラウザの localStorage にのみ保存されます。

**週1回・60分収録**を想定した月額費用（月4.3回換算）:

| プロバイダ | 文字起こし | 説明文生成 | 月額目安 | 備考 |
|---|---|---|---|---|
| **Google Gemini（推奨）** | gemini-2.5-flash | 同left | **0円**（無料枠内） | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) で無料発行。60分音声≈11.5万トークンで無料枠に収まる。有料プランでも1回約$0.09（月約60円） |
| OpenAI | Whisper ($0.006/分) | gpt-4o-mini | 約250円 | 60分=$0.36/回。精度・句読点は優秀 |
| （参考）Groq | whisper-large-v3-turbo | Llama等 | 約30円 or 無料枠 | 未実装。爆速・激安なので将来の選択肢 |
| （参考）Claude | ―（音声入力非対応） | Haiku 4.5 | 説明文のみ約15円 | 文字起こしには使えないため説明文生成のみ |
| （参考）ローカルWhisper | whisper.cpp | ― | 0円 | Apple Siliconなら実用速度。完全オフライン派向け |

> **結論: Gemini の無料枠を使えば実質0円で運用できます。**

### 文字起こしの仕様

- API送信用の音声は自動的に「BGMなし・モノラル・32kbps MP3」に圧縮されます（60分≈14MB）
- OpenAI Whisper は25MB制限があるため、この圧縮で60分収録まで対応
- Gemini は Files API 経由（2GBまで）なので長尺でも問題ありません

## Spotify への投稿について

Spotify（旧 Spotify for Podcasters / Anchor）には**エピソードを自動投稿できる公開APIが存在しません**（2026年時点。公開APIは再生データの取得等のみ）。そのためこのツールでは:

1. 完成MP3をダウンロード
2. タイトル・説明文をワンクリックコピー
3. [Spotify for Creators の新規エピソード画面](https://creators.spotify.com/pod/dashboard/episodes/wizard)を開いてアップロード

という**最短の手動フロー**に落とし込んでいます。将来APIが公開されたら `src/components/FinishStep.tsx` に投稿ボタンを足すだけの構造です。
（なお、自動投稿がどうしても必要なら RSS 配信型ホスティング（Cloudflare R2 + RSS等）への移行という道もあります）

## データの保存場所

| データ | 場所 | 消えるタイミング |
|---|---|---|
| 収録音声（圧縮済みチャンク） | IndexedDB | 「セッションを完了して削除」を押した時 / 新規収録開始時に旧データ削除 |
| 設定・APIキー・テンプレート | localStorage | 手動で消すまで保持 |
| 書き出したMP3/WAV | ダウンロードフォルダ | ― |

## 技術構成

- **Vite + React + TypeScript**、外部UIライブラリなし
- 録音: `MediaRecorder`（Opus/WebM, 128kbps）× マイク・システム音声の2系統
- ミックス: Web Audio API。プレビューと書き出しで同一のグラフ構築コード（`src/audio/mix.ts`）を共有
  - BGMダッキングは `GainNode` のエンベロープオートメーション、マスターに `DynamicsCompressor` のリミッター
- 書き出し: `OfflineAudioContext` でレンダリング → Web Worker 上の [lamejs](https://github.com/zhuker/lamejs)（[@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs)・LGPL-3.0）でMP3エンコード
- LLM: プロバイダ抽象（`src/llm/`）。モック / Gemini / OpenAI を差し替え可能

```
src/
  audio/    recorder(録音) / decode / analysis(音量解析) / mix(グラフ+ダッキング)
            preview / render(書き出し) / wav / mp3.worker
  llm/      provider(抽象) / mock / gemini / openai
  components/  RecordStep / EditStep / FinishStep / Waveform / SettingsModal / common
  db.ts     IndexedDB（クラッシュ復元）
```

## Electron 化について（必要になったら）

現状は Chrome の画面共有ダイアログ経由でシステム音声を取得しています。ワンクリック化したい・配布したい場合は Electron でラップします:

1. `electron` + `electron-builder` を追加し、`dist/` を読み込むだけの main プロセスを書く
2. システム音声取得を `desktopCapturer` + `getUserMedia(chromeMediaSource)` に置き換え（Windowsはループバック取得可。macOSは要 ScreenCaptureKit / 仮想デバイス）
3. Win/Mac 両対応のインストーラは electron-builder が生成

Webアプリのままでも運用上の支障はないため、まず現構成での運用をおすすめします。

## デプロイ（GitHub Pages）

`main` ブランチへの push で GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が自動ビルド・デプロイします。
初回のみリポジトリの Settings → Pages → Source を「GitHub Actions」に設定してください。

公開URL: https://kzonag.github.io/MinimalPodStudio/

## 既知の制限

- Safari / Firefox 非対応（システム音声取得のため）
- 3時間を超える収録はメモリ的に非推奨
- MP3のID3タグ（アートワーク等）は未付与（Spotify側で設定されるため実用上問題なし）

## ライセンス

MIT License（[LICENSE](LICENSE)）

MP3エンコードには [lamejs](https://github.com/zhuker/lamejs)（LGPL-3.0）のフォークである [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs) を未改変のnpm依存として使用しています。
