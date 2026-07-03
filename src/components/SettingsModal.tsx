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

  const keyField = (
    label: React.ReactNode,
    key: 'geminiKey' | 'openaiKey',
    placeholder: string,
  ) => (
    <div className="form-row">
      <label>{label}</label>
      <div className="card-row" style={{ margin: 0 }}>
        <input
          type={showKeys ? 'text' : 'password'}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value.trim() })}
          placeholder={placeholder}
          autoComplete="off"
          style={{ flex: 1 }}
        />
        {draft[key] && (
          <button className="danger" onClick={() => setDraft({ ...draft, [key]: '' })} title="このキーを消去します">
            削除
          </button>
        )}
      </div>
    </div>
  );

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

        {keyField('Gemini APIキー（aistudio.google.com/apikey で無料発行）', 'geminiKey', 'AIza...')}
        {keyField('OpenAI APIキー', 'openaiKey', 'sk-...')}

        <div className="card-row hint">
          <label>
            <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} /> キーを表示
          </label>
          <label>
            <input
              type="checkbox"
              checked={!draft.persistKeys}
              onChange={(e) => setDraft({ ...draft, persistKeys: !e.target.checked })}
            />{' '}
            キーをこのブラウザに保存しない（再読み込みで消えます・共有PC向け）
          </label>
        </div>
        <div className="hint" style={{ marginBottom: 4 }}>
          キーは既定でこのブラウザの localStorage にのみ保存されます（開発者のサーバー等へは送信されません）。
          削除・保存オフは「保存」を押した時点で反映されます。漏洩に備え、Gemini はリファラー制限、OpenAI
          は月額上限の設定を推奨（詳細は README）。
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
