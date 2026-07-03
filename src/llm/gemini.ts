import { DESCRIPTION_PROMPT, GenerateResult, LlmProvider, TemplateOptions, parseTitleAndDescription } from './provider';

// Gemini API（無料枠あり）。音声は Files API にアップロードしてから generateContent に渡す。
// ブラウザから直接呼び出す（CORS対応済みエンドポイント）。

const BASE = 'https://generativelanguage.googleapis.com';
const MODEL = 'gemini-2.5-flash';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function uploadFile(key: string, blob: Blob, onStatus?: (msg: string) => void): Promise<string> {
  onStatus?.('Gemini: 音声をアップロード中…');
  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(blob.size),
      'X-Goog-Upload-Header-Content-Type': blob.type || 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: `podcast-${Date.now()}.mp3` } }),
  });
  if (!startRes.ok) throw new Error(`Gemini アップロード開始に失敗 (${startRes.status}): ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('Gemini からアップロードURLを取得できませんでした');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
    },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error(`Gemini アップロードに失敗 (${uploadRes.status}): ${await uploadRes.text()}`);
  const info = await uploadRes.json();
  let file = info.file;

  // 処理完了（ACTIVE）まで待機
  onStatus?.('Gemini: ファイル処理を待機中…');
  for (let i = 0; i < 60 && file.state === 'PROCESSING'; i++) {
    await sleep(2000);
    const poll = await fetch(`${BASE}/v1beta/${file.name}?key=${encodeURIComponent(key)}`);
    if (!poll.ok) throw new Error(`Gemini ファイル状態の取得に失敗 (${poll.status})`);
    file = await poll.json();
  }
  if (file.state !== 'ACTIVE') throw new Error(`Gemini ファイルが利用可能になりませんでした (state: ${file.state})`);
  return file.uri as string;
}

async function generateContent(key: string, parts: unknown[]): Promise<string> {
  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) throw new Error(`Gemini API エラー (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) throw new Error('Gemini から有効な応答が得られませんでした');
  return text as string;
}

export function createGeminiProvider(apiKey: string): LlmProvider {
  return {
    id: 'gemini',
    label: 'Google Gemini（無料枠あり）',

    async transcribe(audio: Blob, onStatus?: (msg: string) => void): Promise<string> {
      if (!apiKey) throw new Error('Gemini APIキーが設定されていません（設定画面から登録してください）');
      const fileUri = await uploadFile(apiKey, audio, onStatus);
      onStatus?.('Gemini: 文字起こしを実行中…（長い音声は数分かかります）');
      return generateContent(apiKey, [
        { file_data: { mime_type: audio.type || 'audio/mpeg', file_uri: fileUri } },
        {
          text: 'この音声はポッドキャストの収録です。日本語で文字起こししてください。話者が複数いる場合は「A:」「B:」のように話者を区別し、フィラー（えー、あの等）は適度に省いて読みやすくしてください。文字起こし本文のみを出力してください。',
        },
      ]);
    },

    async generateDescription(transcript: string, templates: TemplateOptions): Promise<GenerateResult> {
      if (!apiKey) throw new Error('Gemini APIキーが設定されていません');
      const text = await generateContent(apiKey, [{ text: DESCRIPTION_PROMPT(templates, transcript) }]);
      return parseTitleAndDescription(text);
    },
  };
}
