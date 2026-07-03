// 会话详情阅读皮肤清单：id 即 data-theme 值，name 为菜单显示名。
// 顺序即下拉菜单顺序。'system' 不设任何 CSS 变量 → 继承 :root + @media。
// 持久化与校验在 services.js（独立 dbStorage 键），此处仅供渲染层取标签与作校验。

export interface Skin {
  id: string
  name: string
}

export const SKINS: Skin[] = [
  { id: 'system', name: '跟随系统' },
  { id: 'light', name: '经典浅色' },
  { id: 'dark', name: '暗夜' },
  { id: 'sepia', name: '护眼·米黄' },
  { id: 'ocean', name: '海洋·靛青' },
  { id: 'forest', name: '森林·墨绿' }
]

const KNOWN = new Set(SKINS.map((s) => s.id))

export function isKnownSkin (id: string): boolean {
  return KNOWN.has(id)
}
