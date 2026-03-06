export interface ManifestParser {
  /** List of external dependency names declared in the manifest */
  parse(packageDir: string): string[]
}
