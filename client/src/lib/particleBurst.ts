/**
 * Particle Explosion Physics Engine for Emoji Reactions (Section 7.5)
 */
export function triggerEmojiBurst(x: number, y: number, emoji: string): void {
  if (typeof document === 'undefined') return;

  const count = 10;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9999';
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.innerText = emoji;
    el.style.position = 'absolute';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = '16px';
    el.style.userSelect = 'none';
    el.style.pointerEvents = 'none';
    el.style.transition = 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1), opacity 600ms ease-out';
    container.appendChild(el);

    const angle = (Math.PI / 4) + (Math.random() * Math.PI) / 2; // Biased upwards
    const distance = 40 + Math.random() * 60;
    const dx = Math.cos(angle) * distance * (Math.random() > 0.5 ? 1 : -1);
    const dy = -Math.sin(angle) * distance;

    requestAnimationFrame(() => {
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${0.4 + Math.random() * 0.4})`;
      el.style.opacity = '0';
    });
  }

  setTimeout(() => {
    container.remove();
  }, 700);
}
