export function extractStaticImportSource(nodeSource) {
  if (!nodeSource) return null

  if (nodeSource.type === 'Literal' && typeof nodeSource.value === 'string') {
    return nodeSource.value
  }

  if (nodeSource.type === 'TemplateLiteral' && nodeSource.expressions.length === 0) {
    return nodeSource.quasis[0]?.value?.cooked ?? null
  }

  return null
}
