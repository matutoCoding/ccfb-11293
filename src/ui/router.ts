// ---------- 极简 hash 路由 ----------
export type RouteHandler = (container: HTMLElement) => void;

const routes = new Map<string, RouteHandler>();
let currentCleanup: (() => void) | null = null;

export function registerRoute(path: string, handler: RouteHandler): void {
  routes.set(path, handler);
}

export function navigate(path: string): void {
  location.hash = '#' + path;
}

export function currentRoute(): string {
  return location.hash.slice(1) || '/samples';
}

export function startRouter(root: HTMLElement, navEl: HTMLElement): void {
  const render = () => {
    const path = currentRoute();
    const handler = routes.get(path) ?? routes.get('/samples')!;
    if (currentCleanup) currentCleanup();
    root.innerHTML = '';
    handler(root);
    // 高亮导航
    for (const a of Array.from(navEl.querySelectorAll('a'))) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + path);
    }
  };
  window.addEventListener('hashchange', render);
  render();
}
