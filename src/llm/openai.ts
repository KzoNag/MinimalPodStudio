import { DESCRIPTION_PROMPT, GenerateResult, LlmProvider, TemplateOptions, parseTitleAndDescription } from './provider';

// OpenAI: Whisper (whisper-1) で文字起こし + gpt-4o-mini で説明文生成。
// 音声は 25MB 制限があるため、書き出し側で 32kbps モノラルに圧縮している（60分 ≈ 14MB）。

export function createOpenAiProvider(apiKey: string): LlmProvider {
  return {
    id: 'openai',
    label: 'OpenAI（Whisper + gpt-4o-mini）',

    async transcribe(audio: Blob, onStatus?: (msg: string) => void): Promise<string> {
      if (!apiKey) throw new Error('OpenAI APIキーが設定されていません（設定画面から登録してください）');
      if (audio.size > 25 * 1024 * 1024) {
        throw new Error('音声が25MBを超えているため Whisper API に送信できません（Gemini をお試しください）');
      }
      onStatus?.('OpenAI: Whisper で文字起こし中…（長い音声は数分かかります）');
      const form = new FormData();
      form.append('file', audio, 'episode.mp3');
      form.append('model', 'whisper-1');
      form.append('language', 'ja');
      form.append('response_format', 'text');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Whisper API エラー (${res.status}): ${await res.text()}`);
      return (await res.text()).trim();
    },

    async generateDescription(transcript: string, templates: TemplateOptions): Promise<GenerateResult> {
      if (!apiKey) throw new Error('OpenAI APIキーが設定されていません');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: DESCRIPTION_PROMPT(templates, transcript) }],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API エラー (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenAI から有効な応答が得られませんでした');
      return parseTitleAndDescription(text);
    },
  };
}
