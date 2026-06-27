'use strict'

// 历史详情页内查找的纯匹配核心。CommonJS，便于 node --test 直接 require。

// 转义正则元字符，使字面量查询不被当作正则
function escapeRegExp (s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 编译查找条件为「全局」正则；空查询返回 re=null；非法正则返回 error
function compileQuery (query, opts) {
  const q = query == null ? '' : String(query)
  if (!q) return { re: null, error: '' }
  const o = opts || {}
  let pattern = o.useRegex ? q : escapeRegExp(q)
  if (o.wholeWord) pattern = '\\b(?:' + pattern + ')\\b'
  let flags = 'g'
  if (!o.caseSensitive) flags += 'i'
  try {
    return { re: new RegExp(pattern, flags), error: '' }
  } catch (e) {
    return { re: null, error: (e && e.message) || '正则无效' }
  }
}

// 求 text 中所有匹配区间 [start,end)；忽略零宽匹配并防死循环
function findInText (text, re) {
  const out = []
  const s = typeof text === 'string' ? text : ''
  if (!re || !s) return out
  re.lastIndex = 0
  let m
  while ((m = re.exec(s)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (m[0].length > 0) out.push([start, end])
    re.lastIndex = end > start ? end : start + 1
  }
  return out
}

module.exports = { escapeRegExp, compileQuery, findInText }
