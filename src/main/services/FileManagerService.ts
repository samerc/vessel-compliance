import * as fs from 'fs'
import * as path from 'path'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
  size?: number
  modified?: string
}

export class FileManagerService {
  /** Read directory contents (non-recursive) */
  static readDirectory(dirPath: string): FileNode[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter((e) => !e.name.startsWith('.') && !e.name.startsWith('~$'))
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
          ...(e.isFile()
            ? (() => {
                try {
                  const stats = fs.statSync(path.join(dirPath, e.name))
                  return { size: stats.size, modified: stats.mtime.toISOString() }
                } catch {
                  return {}
                }
              })()
            : {}),
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  }

  /** Read directory tree (recursive, directories only, up to depth) */
  static readTree(dirPath: string, depth = 3): FileNode {
    const name = path.basename(dirPath)
    const node: FileNode = { name, path: dirPath, isDirectory: true }
    if (depth > 0) {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        node.children = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => this.readTree(path.join(dirPath, e.name), depth - 1))
      } catch {
        node.children = []
      }
    }
    return node
  }

  /** Move a folder and return old→new path for remapping */
  static moveFolder(
    sourcePath: string,
    destParentPath: string
  ): { oldPath: string; newPath: string } {
    const folderName = path.basename(sourcePath)
    const newPath = path.join(destParentPath, folderName)
    if (fs.existsSync(newPath)) throw new Error(`Folder "${folderName}" already exists at destination`)
    fs.renameSync(sourcePath, newPath)
    return { oldPath: sourcePath, newPath }
  }

  /** Rename a folder */
  static renameFolder(folderPath: string, newName: string): { oldPath: string; newPath: string } {
    const parentDir = path.dirname(folderPath)
    const newPath = path.join(parentDir, newName)
    if (fs.existsSync(newPath)) throw new Error(`"${newName}" already exists`)
    fs.renameSync(folderPath, newPath)
    return { oldPath: folderPath, newPath }
  }

  /** Create a new folder */
  static createFolder(parentPath: string, name: string): string {
    const newPath = path.join(parentPath, name)
    if (fs.existsSync(newPath)) throw new Error(`"${name}" already exists`)
    fs.mkdirSync(newPath, { recursive: true })
    return newPath
  }

  /** Check if a path exists */
  static exists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }

  /** Get file metadata */
  static getFileInfo(filePath: string): { size: number; modified: string; ext: string } | null {
    try {
      const stats = fs.statSync(filePath)
      return { size: stats.size, modified: stats.mtime.toISOString(), ext: path.extname(filePath) }
    } catch {
      return null
    }
  }
}
