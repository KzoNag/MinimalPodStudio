export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>❓ このツールについて</h2>
        <p>
          Minimal Pod Studio は「<b>とにかく簡単にPodcastを収録して公開する</b>」ことに特化したツールです。
          多機能な編集ソフトの代わりではなく、毎週の収録〜公開を最小の手数で回すために、機能をあえて絞っています。
          すべてブラウザ内で動作し、音声がサーバーに送られることはありません。
        </p>

        <h3>使い方（4ステップ）</h3>
        <ol className="help-list">
          <li>
            🎙️ <b>収録</b> — マイクを有効化して録音。通話相手がいる場合は「画面共有で取得」で相手の声も別トラックで録音できます（通話自体はDiscord等をそのまま使用）
          </li>
          <li>
            ✂️ <b>編集</b> — 波形を見ながら前後の不要部分を切って、BGMファイルを選ぶだけ。音量バランスとBGMのダッキング（本編中の音量ダウン）は自動です
          </li>
          <li>📦 <b>仕上げ</b> — MP3書き出し・文字起こし・説明文生成（文字起こしはAPIキー登録で有効化、無料枠でOK）</li>
          <li>🚀 <b>公開</b> — Spotify for Creators にアップロードし、生成したタイトル・説明文を貼り付け</li>
        </ol>

        <h3>できること</h3>
        <ul className="help-list">
          <li>自分の声＋通話相手の声の2トラック同時録音（クラッシュしても自動復元）</li>
          <li>音量バランスの自動調整 / 前後トリミング / BGMループ＋ダッキング</li>
          <li>MP3/WAV書き出し、文字起こし、テンプレートに沿った説明文生成</li>
          <li>録音済みファイル（1〜2個）を読み込んで編集だけ行うことも可能</li>
        </ul>

        <h3>あえてやらないこと</h3>
        <p className="hint">「編集に時間をかけない」がコンセプトのため、以下は搭載していません。</p>
        <ul className="help-list">
          <li>途中のカット・並べ替え編集（対応するのは前後のトリミングのみ）</li>
          <li>EQ・コンプレッサー等の手動エフェクト（音量調整とクリップ防止は自動）</li>
          <li>エピソードの保存・管理機能（1収録＝1セッション。書き出したら完了）</li>
          <li>Spotifyへの自動アップロード（公開APIが存在しないため手動）</li>
        </ul>
        <p className="hint">
          細かく編集したい回だけ、書き出したMP3を Audacity 等の編集ソフトで仕上げる使い分けがおすすめです。
        </p>

        <h3>収録のコツ</h3>
        <ul className="help-list">
          <li>🎧 ヘッドホン/イヤホンを使う（スピーカーだと相手の声がマイクに回り込みます）</li>
          <li>🔕 収録中はOSの通知をオフに（通知音がシステム音声トラックに録音されます）</li>
          <li>🚩 話題の切り替わりでマーカーを打っておくと、編集時に迷いません</li>
        </ul>

        <div className="footer-nav">
          <span />
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
