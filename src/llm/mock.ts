import { GenerateResult, LlmProvider, TemplateOptions } from './provider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MOCK_TRANSCRIPT = `（これはモックの文字起こしです。設定画面から Gemini / OpenAI の APIキーを登録すると実際の文字起こしが実行されます）

A: はい、始まりました。今週もやっていきましょう。
B: よろしくお願いします。今日は最近試した新しいツールの話をしようと思っていて。
A: お、いいですね。先週ちょっと話していたやつですか？
B: そうそう。実際に1週間使ってみたので、良かったところと微妙だったところを正直にレビューしていきます。
A: ではまず全体の印象から聞いていきましょうか。
B: 一言でいうと「思ったより良い」でした。特にセットアップが簡単で……`;

export const mockProvider: LlmProvider = {
  id: 'mock',
  label: 'モック（APIキー不要）',

  async transcribe(_audio: Blob, onStatus?: (msg: string) => void): Promise<string> {
    onStatus?.('モック: 文字起こしを実行中…');
    await sleep(1500);
    onStatus?.('モック: 整形中…');
    await sleep(800);
    return MOCK_TRANSCRIPT;
  },

  async generateDescription(_transcript: string, templates: TemplateOptions): Promise<GenerateResult> {
    await sleep(1200);
    // 実プロバイダはテンプレートを雛形に説明文全体を生成する。
    // モックではプレースホルダー置換で近似し、無い場合はその旨を付記する。
    let description = templates.description
      .replace(
        '{summary}',
        '（モック）今回は最近試した新しいツールを1週間使ってみた正直レビュー。セットアップの手軽さから実運用でのつまずきポイントまで話しました。',
      )
      .replace(
        '{topics}',
        '・今週のトピック紹介\n・新ツールのファーストインプレッション\n・良かった点3つ / 微妙だった点2つ\n・来週の予告',
      );
    if (description === templates.description) {
      description = `${templates.description}\n\n---\n（モック: 実際のプロバイダでは、この雛形に沿って説明文全体が生成されます）`;
    }
    const baseTitle = '（モック）新ツールを1週間ガチ使いしてみた';
    const tpl = templates.title.trim() || '{title}';
    const title = tpl.includes('{title}') ? tpl.replace('{title}', baseTitle) : `${tpl}${baseTitle}`;
    return { title, description };
  },
};
