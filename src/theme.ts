// 渲染层主题工具：在 :root 上覆盖主色变量，供 App 初始化与配置面板共用

// 与黑色混合约 12%（各通道 ×0.88）派生悬停色，保持色相、压暗
function deriveHover(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.88)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.88)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.88)
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return '#' + to2(r) + to2(g) + to2(b)
}

// 应用主色：写入 --primary-color 与派生的 --primary-hover
export function applyTheme(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--primary-color', hex)
  root.style.setProperty('--primary-hover', deriveHover(hex))
}

// 清除运行时覆盖，回退到 variables.css 中的默认值
export function clearTheme(): void {
  const root = document.documentElement
  root.style.removeProperty('--primary-color')
  root.style.removeProperty('--primary-hover')
}

// 从持久化读取并应用主色；无自定义则清除覆盖用默认
export function initTheme(): void {
  const s = window.services.getThemeSettings()
  if (s && s.primaryColor) {
    applyTheme(s.primaryColor)
  } else {
    clearTheme()
  }
}
