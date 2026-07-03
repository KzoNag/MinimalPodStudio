import { useState } from 'react';
import { AppSettings, DEFAULT_TEMPLATE, LlmProviderId } from '../types';

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [showKeys, setShowKeys] = useState(false);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ 設定</h2>

        <div className="form-row">
          <label>文字起こし・説明文生成のプロバイダ</label>
          <select
            value={draft.provider}
            onChange={(e) => setDraft({ ...draft, provider: e.target.value as LlmProviderId })}
          >
            <option value="mock">モック（APIキー不要・動作確認用）</option>
            <option value="gemini">Google Gemini（無料枠あり・推奨）</option>
            <option value="openai">OpenAI（Whisper + gpt-4o-mini）</option>
          </select>
        </div>

        <div className="form-row">
          <label>Gemini APIキー（aistudio.google.com/apikey で無料発行）</label>
          <input
            type={showKeys ? 'text' : 'password'}
            value={draft.geminiKey}
            onChange={(e) => setDraft({ ...draft, geminiKey: e.target.value.trim() })}
            placeholder="AIza..."
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <label>OpenAI APIキー</label>
          <input
            type={showKeys ? 'text' : 'password'}
            value={draft.openaiKey}
            onChange={(e) => setDraft({ ...draft, openaiKey: e.target.value.trim() })}
            placeholder="sk-..."
            autoComplete="off"
          />
        </div>

        <div className="card-row hint">
          <label>
            <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} /> キーを表示
          </label>
          <span>キーはこのブラウザの localStorage にのみ保存されます。共有PCでは注意してください。</span>
        </div>

        <div className="form-row">
          <label>タイトルテンプレート（{'{title}'} が生成タイトルに置き換わります。例:「【番組名】{'{title}'} #12」）</label>
          <input
            type="text"
            value={draft.titleTemplate}
            onChange={(e) => setDraft({ ...draft, titleTemplate: e.target.value })}
            placeholder="{title}"
          />
        </div>

        <div className="form-row">
          <label>
            説明文テンプレート（この雛形に沿ってLLMが説明文全体を生成します。{'{summary}'} などの穴埋めや「カジュアルな口調で」といった指示も書けます）
          </label>
          <textarea
            rows={9}
            value={draft.template}
            onChange={(e) => setDraft({ ...draft, template: e.target.value })}
          />
          <button style={{ marginTop: 6 }} onClick={() => setDraft({ ...draft, template: DEFAULT_TEMPLATE })}>
            既定に戻す
          </button>
        </div>

        <div className="hint" style={{ margin: '14px 0' }}>
          💰 費用目安（週1回・60分収録の場合）: Gemini 無料枠 = <b>0円</b> / OpenAI ≈ 月250円（Whisper
          $0.006/分）。詳しくは README を参照。
        </div>

        <div className="footer-nav">
          <button onClick={onClose}>キャンセル</button>
          <button
            className="primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
