import path from 'node:path'

export function normalizePath(absolutePath) {
  return path.resolve(absolutePath).replaceAll(path.sep, '/')
}

export function findWorkspaceRootFromFilename(filename) {
  const parts = normalizePath(filename).split('/')
  const appsIndex = parts.indexOf('apps')
  const packagesIndex = parts.indexOf('packages')

  let index = appsIndex
  if (index === -1) index = packagesIndex
  if (index !== -1 && packagesIndex !== -1) index = Math.min(index, packagesIndex)

  if (index === -1) return null
  return parts.slice(0, index).join('/')
}
