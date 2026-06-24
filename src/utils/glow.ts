/**
 * 卡片鼠标跟随聚光灯效果
 * 在 onMouseMove 中调用，将鼠标位置（百分比）写到 CSS 变量 --mx/--my
 * 配合 CSS .book-cover::after 的点光源径向渐变使用
 */
export function handleCardGlow(e: React.MouseEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const pctX = ((e.clientX - rect.left) / rect.width) * 100 + "%";
  const pctY = ((e.clientY - rect.top) / rect.height) * 100 + "%";
  el.style.setProperty("--mx", pctX);
  el.style.setProperty("--my", pctY);
  // 子元素 .book-cover 的 ::after 需要单独设变量
  el.querySelectorAll(".book-cover").forEach((cover) => {
    (cover as HTMLElement).style.setProperty("--mx", pctX);
    (cover as HTMLElement).style.setProperty("--my", pctY);
  });
}
