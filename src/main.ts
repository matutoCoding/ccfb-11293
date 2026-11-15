// ---------- 应用入口 ----------
import { registerRoute, startRouter } from './ui/router';
import { renderSamplesPage } from './ui/pages/samples';
import { renderEditorPage } from './ui/pages/editor';
import { renderViewerPage } from './ui/pages/viewer';
import { renderComparePage } from './ui/pages/compare';
import { renderSettingsPage } from './ui/pages/settings';
import { el } from './ui/widgets';
import './styles.css';

registerRoute('/samples', renderSamplesPage);
registerRoute('/editor', renderEditorPage);
registerRoute('/viewer', renderViewerPage);
registerRoute('/compare', renderComparePage);
registerRoute('/settings', renderSettingsPage);

const app = document.getElementById('app')!;

const nav = el('nav', { className: 'top-nav' },
  el('span', { className: 'logo' }, '🔬 光弹应力可视化'),
  el('a', { href: '#/samples' }, '样品库'),
  el('a', { href: '#/editor' }, '应力编辑'),
  el('a', { href: '#/viewer' }, '偏光观察'),
  el('a', { href: '#/compare' }, '对比'),
  el('a', { href: '#/settings' }, '设置'),
);

const pageRoot = el('main', { className: 'page-root' });

app.append(nav, pageRoot);
startRouter(pageRoot, nav);
