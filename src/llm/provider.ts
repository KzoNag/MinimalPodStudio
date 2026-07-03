import { AppSettings } from '../types';

export interface GenerateResult {
  title: string;
  description: string;
}

export interface TemplateOptions {
  /** タイトルテンプレート。{title} が生成タイトルに置き換わる */
  title: string;
  /** 説明文テンプレート（雛形）。LLMがこれに沿って説明文全体を生成する */
  description: string;
}

export interface LlmProvider {
  id: string;
  label: string;
  /** 音声（MP3）を文字起こしする */
  transcribe(audio: Blob, onStatus?: (msg: string) => void): Promise<string>;
  /** 文字起こしからテンプレートに沿った説明文とタイトルを生成する */
  generateDescription(transcript: string, templates: TemplateOptions): Promise<GenerateResult>;
}

export const DESCRIPTION_PROMPT = (templates: TemplateOptions, transcript: string) => `あなたはポッドキャストの編集アシスタントです。以下の文字起こしを読み、エピソードのタイトルと説明文を作成してください。

# 指示
- タイトルはタイトルテンプレートの {title} を、エピソード内容に基づく簡潔なタイトル（30文字以内目安、飾り記号なし）に置き換えて完成させる。テンプレートのその他の文字（番組名・話数など）は一切変更しない。{title} が含まれない場合はテンプレートの末尾にタイトルを続ける
- 説明文は「説明文テンプレート」を雛形として、エピソード内容に合わせて説明文全体を書き上げる
  - テンプレートの構成・見出し・定型文・ハッシュタグなどの意図を尊重する
  - {summary} や {topics}、「（〜をここに）」のようなプレースホルダーや穴埋め箇所があれば、適切な内容に置き換える（目安: 要約は2〜3文、トピックは「・」区切りの箇条書き）
  - テンプレートに書き方の指示（例:「カジュアルな口調で」など）が含まれる場合はそれに従い、指示文自体は出力しない
- 出力フォーマット:
  - 1行目: 完成したタイトル
  - 2行目: 空行
  - 3行目以降: 説明文本体
- 前置きや後書きは出力しない

# タイトルテンプレート
${templates.title.trim() || '{title}'}

# 説明文テンプレート
${templates.description}

# 文字起こし
${transcript}`;

export function parseTitleAndDescription(text: string): GenerateResult {
  const trimmed = text.trim();
  const idx = trimmed.indexOf('\n');
  if (idx === -1) return { title: trimmed, description: '' };
  const title = trimmed
    .slice(0, idx)
    .replace(/^(タイトル案?[:：]\s*)/, '')
    .trim();
  const description = trimmed.slice(idx + 1).trim();
  return { title, description };
}
