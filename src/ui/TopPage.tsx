export const TopPage = () => (
  <main className="top-shell">
    <header className="top-header">
      <p className="top-eyebrow">Private Tools</p>
      <button type="button" className="top-theme-toggle" data-theme-toggle aria-label="テーマ切替">
        ダーク
      </button>
    </header>
    <ul className="top-tool-list">
      <li>
        <a className="top-tool-card" href="/tools/credit-csv">
          <span className="top-tool-name">Credit CSV Viewer</span>
          <span className="top-tool-desc">クレジットカード利用明細CSVを集計・閲覧する</span>
        </a>
      </li>
    </ul>
  </main>
)
