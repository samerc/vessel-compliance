import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Edit3,
  Move,
  ExternalLink,
  FolderPlus,
  HardDrive,
  Settings,
  FileText,
  Image,
  FileSpreadsheet,
  Activity,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { FileNode } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (iso?: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

const baseName = (p: string) => {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext))
    return <Image size={16} style={{ color: '#ff64c8' }} />
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return <FileSpreadsheet size={16} style={{ color: '#44cc88' }} />
  if (['pdf'].includes(ext)) return <FileText size={16} style={{ color: '#ff6b6b' }} />
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext))
    return <FileText size={16} style={{ color: '#6464ff' }} />
  return <File size={16} style={{ color: 'var(--text-secondary)' }} />
}

// ---------------------------------------------------------------------------
// TreeNode (recursive)
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onContextMenu: (e: React.MouseEvent, path: string) => void
  isLight: boolean
}

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onContextMenu,
  isLight,
}: TreeNodeProps) {
  if (!node.isDirectory) return null
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          paddingLeft: depth * 16 + 8,
          cursor: 'pointer',
          borderRadius: 6,
          background: isSelected ? 'rgba(0,210,255,0.1)' : 'transparent',
          color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
          fontSize: '0.85rem',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onClick={() => onSelect(node.path)}
        onContextMenu={(e) => onContextMenu(e, node.path)}
        title={node.name}
      >
        <span
          onClick={(e) => {
            e.stopPropagation()
            onToggle(node.path)
          }}
          style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          {isExpanded ? (
            <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
          )}
        </span>
        {isExpanded ? (
          <FolderOpen size={15} style={{ color: '#ffb020', flexShrink: 0 }} />
        ) : (
          <Folder size={15} style={{ color: '#ffb020', flexShrink: 0 }} />
        )}
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {node.name}
        </span>
      </div>
      {isExpanded &&
        node.children
          ?.filter((c) => c.isDirectory)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              isLight={isLight}
            />
          ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// FileManager
// ---------------------------------------------------------------------------

export default function FileManager() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showSuccess, showError, showToast } = useToast()

  // Core state
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<FileNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [contents, setContents] = useState<FileNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    path: string
    isDir: boolean
  } | null>(null)

  // Modals
  const [renameModal, setRenameModal] = useState<{ path: string; name: string } | null>(null)
  const [moveModal, setMoveModal] = useState<{ sourcePath: string } | null>(null)
  const [moveDestination, setMoveDestination] = useState<string | null>(null)
  const [newFolderModal, setNewFolderModal] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [healthCheckResults, setHealthCheckResults] = useState<
    { table: string; id: string; column: string; path: string; label: string; exists: boolean }[] | null
  >(null)
  const [showSettings, setShowSettings] = useState(false)
  const [newRootInput, setNewRootInput] = useState('')
  const [healthLoading, setHealthLoading] = useState(false)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadRoot = useCallback(async () => {
    try {
      const root = await window.api.fileManagerGetRoot()
      setRootPath(root)
      if (root) {
        setNewRootInput(root)
      }
      return root
    } catch {
      return null
    }
  }, [])

  const loadTree = useCallback(
    async (root?: string) => {
      const r = root || rootPath
      if (!r) return
      setLoading(true)
      try {
        const t = await window.api.fileManagerReadTree(r, 4)
        setTree(t)
        // Auto-expand root
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.add(r)
          return next
        })
      } catch (err: any) {
        showError('Failed to read directory tree: ' + (err?.message || err))
      } finally {
        setLoading(false)
      }
    },
    [rootPath, showError],
  )

  const loadContents = useCallback(
    async (dirPath: string) => {
      try {
        const items = await window.api.fileManagerReadDirectory(dirPath)
        setContents(items)
      } catch (err: any) {
        showError('Failed to read directory: ' + (err?.message || err))
        setContents([])
      }
    },
    [showError],
  )

  // Initial load
  useEffect(() => {
    ;(async () => {
      const root = await loadRoot()
      if (root) {
        await loadTree(root)
        setSelectedPath(root)
        const items = await window.api.fileManagerReadDirectory(root)
        setContents(items)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Tree interaction
  // -------------------------------------------------------------------------

  const handleSelectFolder = useCallback(
    async (path: string) => {
      setSelectedPath(path)
      await loadContents(path)
    },
    [loadContents],
  )

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleTreeContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir: true })
  }, [])

  const handleContentsContextMenu = useCallback(
    (e: React.MouseEvent, path: string, isDir: boolean) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, path, isDir })
    },
    [],
  )

  // Close context menu on any click
  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  // Close modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setRenameModal(null)
        setMoveModal(null)
        setNewFolderModal(null)
        setHealthCheckResults(null)
        setShowSettings(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleRename = useCallback(async () => {
    if (!renameModal) return
    const newName = renameInputRef.current?.value?.trim()
    if (!newName || newName === renameModal.name) {
      setRenameModal(null)
      return
    }
    try {
      const result = await window.api.fileManagerRenameFolder(renameModal.path, newName)
      showSuccess(`Renamed. ${result.remapped} file link${result.remapped !== 1 ? 's' : ''} remapped.`)
      setRenameModal(null)
      await loadTree()
      if (selectedPath === renameModal.path || selectedPath?.startsWith(renameModal.path + '\\')) {
        const newSelected = selectedPath.replace(renameModal.path, result.newPath)
        setSelectedPath(newSelected)
        await loadContents(newSelected)
      } else if (selectedPath) {
        await loadContents(selectedPath)
      }
    } catch (err: any) {
      showError('Rename failed: ' + (err?.message || err))
    }
  }, [renameModal, loadTree, selectedPath, loadContents, showSuccess, showError])

  const handleMove = useCallback(async () => {
    if (!moveModal || !moveDestination) return
    try {
      const result = await window.api.fileManagerMoveFolder(moveModal.sourcePath, moveDestination)
      showSuccess(`Moved. ${result.remapped} file link${result.remapped !== 1 ? 's' : ''} remapped.`)
      setMoveModal(null)
      setMoveDestination(null)
      await loadTree()
      if (
        selectedPath === moveModal.sourcePath ||
        selectedPath?.startsWith(moveModal.sourcePath + '\\')
      ) {
        setSelectedPath(rootPath)
        if (rootPath) await loadContents(rootPath)
      } else if (selectedPath) {
        await loadContents(selectedPath)
      }
    } catch (err: any) {
      showError('Move failed: ' + (err?.message || err))
    }
  }, [moveModal, moveDestination, loadTree, selectedPath, rootPath, loadContents, showSuccess, showError])

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderModal) return
    const name = newFolderName.trim()
    if (!name) return
    try {
      await window.api.fileManagerCreateFolder(newFolderModal, name)
      showSuccess(`Folder "${name}" created.`)
      setNewFolderModal(null)
      setNewFolderName('')
      await loadTree()
      if (selectedPath === newFolderModal) {
        await loadContents(newFolderModal)
      }
    } catch (err: any) {
      showError('Create folder failed: ' + (err?.message || err))
    }
  }, [newFolderModal, newFolderName, loadTree, selectedPath, loadContents, showSuccess, showError])

  const handleHealthCheck = useCallback(async () => {
    setHealthLoading(true)
    try {
      const results = await window.api.fileManagerHealthCheck()
      setHealthCheckResults(results)
    } catch (err: any) {
      showError('Health check failed: ' + (err?.message || err))
    } finally {
      setHealthLoading(false)
    }
  }, [showError])

  const handleOpenInExplorer = useCallback(
    async (path: string) => {
      try {
        await window.api.fileManagerOpenInExplorer(path)
      } catch (err: any) {
        showError('Failed to open: ' + (err?.message || err))
      }
    },
    [showError],
  )

  const handleOpenFile = useCallback(
    async (path: string) => {
      try {
        await window.api.fileManagerOpenFile(path)
      } catch (err: any) {
        showError('Failed to open file: ' + (err?.message || err))
      }
    },
    [showError],
  )

  const handleSaveRoot = useCallback(async () => {
    const val = newRootInput.trim()
    if (!val) return
    try {
      await window.api.fileManagerSetRoot(val)
      setRootPath(val)
      setShowSettings(false)
      showSuccess('Root folder updated.')
      await loadTree(val)
      setSelectedPath(val)
      await loadContents(val)
    } catch (err: any) {
      showError('Failed to set root: ' + (err?.message || err))
    }
  }, [newRootInput, loadTree, loadContents, showSuccess, showError])

  const handleBrowseRoot = useCallback(async () => {
    try {
      const dir = await window.api.setupSelectDirectory()
      if (dir) {
        setNewRootInput(dir)
      }
    } catch {
      // user cancelled
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    await loadTree()
    if (selectedPath) await loadContents(selectedPath)
    showToast('Refreshed', 'info')
  }, [loadTree, selectedPath, loadContents, showToast])

  const handleDoubleClickItem = useCallback(
    async (item: FileNode) => {
      if (item.isDirectory) {
        setSelectedPath(item.path)
        await loadContents(item.path)
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.add(item.path)
          return next
        })
      } else {
        await handleOpenFile(item.path)
      }
    },
    [loadContents, handleOpenFile],
  )

  // -------------------------------------------------------------------------
  // Breadcrumbs
  // -------------------------------------------------------------------------

  const getBreadcrumbs = useCallback(() => {
    if (!selectedPath || !rootPath) return []
    const normRoot = rootPath.replace(/\\/g, '/')
    const normSelected = selectedPath.replace(/\\/g, '/')
    const relative = normSelected.startsWith(normRoot)
      ? normSelected.slice(normRoot.length).replace(/^\//, '')
      : ''
    const crumbs = [{ name: baseName(rootPath), fullPath: rootPath }]
    if (relative) {
      const parts = relative.split('/').filter(Boolean)
      let current = rootPath
      for (const part of parts) {
        current = current + '\\' + part
        crumbs.push({ name: part, fullPath: current })
      }
    }
    return crumbs
  }, [selectedPath, rootPath])

  // -------------------------------------------------------------------------
  // Filtered contents
  // -------------------------------------------------------------------------

  const filteredContents = contents
    .filter((item) => {
      if (!search) return true
      return item.name.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => {
      // Folders first, then alphabetical
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

  // -------------------------------------------------------------------------
  // Modal backdrop style
  // -------------------------------------------------------------------------

  const modalBackdrop: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  }

  const modalBox: React.CSSProperties = {
    background: isLight ? '#ffffff' : '#1a1d28',
    borderRadius: 12,
    padding: 24,
    minWidth: 400,
    maxWidth: 560,
    width: '90%',
    border: 'var(--glass-border)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  }

  const modalTitle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid var(--input-border)`,
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  }

  // -------------------------------------------------------------------------
  // First-time setup
  // -------------------------------------------------------------------------

  if (rootPath === null && !loading) {
    // Still checking — show nothing while loadRoot runs
  }

  if (rootPath === null) {
    return (
      <div style={{ padding: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HardDrive size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.4rem' }}>
              File Manager
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Manage your document folder structure
            </p>
          </div>
        </div>

        <div
          className="glass-card"
          style={{
            padding: 40,
            textAlign: 'center',
            maxWidth: 500,
          }}
        >
          <HardDrive size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
          <h3
            style={{
              color: 'var(--text-primary)',
              marginBottom: 8,
              fontSize: '1.1rem',
            }}
          >
            Configure Your Document Root
          </h3>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            Select the root folder where your vessel documents are stored. This will be the top-level
            folder displayed in the file manager.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <input
              type="text"
              value={newRootInput}
              onChange={(e) => setNewRootInput(e.target.value)}
              placeholder="C:\Documents\Vessels"
              style={{ ...inputStyle, width: 280 }}
            />
            <button className="btn-secondary" onClick={handleBrowseRoot}>
              Browse
            </button>
            <button
              className="btn-primary"
              onClick={handleSaveRoot}
              disabled={!newRootInput.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Health check summary
  // -------------------------------------------------------------------------

  const healthOk = healthCheckResults?.filter((r) => r.exists).length ?? 0
  const healthBroken = healthCheckResults?.filter((r) => !r.exists).length ?? 0
  const healthTotal = healthCheckResults?.length ?? 0

  // -------------------------------------------------------------------------
  // Move modal tree (simplified)
  // -------------------------------------------------------------------------

  function MoveTreeNode({
    node,
    depth,
    sourcePath,
  }: {
    node: FileNode
    depth: number
    sourcePath: string
  }) {
    const [expanded, setExpanded] = useState(depth < 2)
    if (!node.isDirectory) return null
    // Don't allow moving into itself or its children
    const isSelf = node.path === sourcePath
    const isChild = node.path.startsWith(sourcePath + '\\')
    const isSelected = moveDestination === node.path

    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 6px',
            paddingLeft: depth * 16 + 6,
            cursor: isSelf || isChild ? 'not-allowed' : 'pointer',
            borderRadius: 6,
            background: isSelected ? 'rgba(0,210,255,0.12)' : 'transparent',
            opacity: isSelf || isChild ? 0.4 : 1,
            fontSize: '0.83rem',
            color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
          }}
          onClick={() => {
            if (!isSelf && !isChild) setMoveDestination(node.path)
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <Folder size={14} style={{ color: '#ffb020', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
        </div>
        {expanded &&
          node.children
            ?.filter((c) => c.isDirectory)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <MoveTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                sourcePath={sourcePath}
              />
            ))}
      </>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={{ padding: 32, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HardDrive size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.4rem' }}>
              File Manager
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Browse and manage your document folder structure
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleHealthCheck}
            disabled={healthLoading}
          >
            <Activity size={15} />
            {healthLoading ? 'Checking...' : 'Health Check'}
          </button>
          <button
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              setNewRootInput(rootPath || '')
              setShowSettings(true)
            }}
          >
            <Settings size={15} />
            Settings
          </button>
        </div>
      </div>

      {/* Main two-panel layout */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Tree panel (left) */}
        <div
          className="glass-card"
          style={{
            width: 260,
            minWidth: 260,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: isLight ? '#f4f6fb' : '#14172a',
          }}
        >
          <div
            style={{
              padding: '12px 14px 8px',
              borderBottom: '1px solid var(--table-border)',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Folder size={14} />
            Folders
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '6px 4px',
            }}
          >
            {loading && !tree ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                <RefreshCw
                  size={18}
                  style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }}
                />
                <div>Loading...</div>
              </div>
            ) : tree ? (
              <TreeNode
                node={tree}
                depth={0}
                selectedPath={selectedPath}
                expandedPaths={expandedPaths}
                onSelect={handleSelectFolder}
                onToggle={handleToggleExpand}
                onContextMenu={handleTreeContextMenu}
                isLight={isLight}
              />
            ) : null}
          </div>
        </div>

        {/* Contents panel (right) */}
        <div
          className="glass-card"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Breadcrumb */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--table-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.85rem',
              flexWrap: 'wrap',
            }}
          >
            {getBreadcrumbs().map((crumb, i, arr) => (
              <span key={crumb.fullPath} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    cursor: 'pointer',
                    color:
                      i === arr.length - 1 ? 'var(--text-primary)' : 'var(--accent-primary)',
                    fontWeight: i === arr.length - 1 ? 600 : 400,
                  }}
                  onClick={() => handleSelectFolder(crumb.fullPath)}
                >
                  {crumb.name}
                </span>
                {i < arr.length - 1 && (
                  <ChevronRight size={13} style={{ color: 'var(--text-secondary)' }} />
                )}
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--table-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px' }}
              onClick={() => {
                if (selectedPath) {
                  setNewFolderModal(selectedPath)
                  setNewFolderName('')
                }
              }}
              disabled={!selectedPath}
            >
              <FolderPlus size={14} />
              New Folder
            </button>
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px' }}
              onClick={() => selectedPath && handleOpenInExplorer(selectedPath)}
              disabled={!selectedPath}
            >
              <ExternalLink size={14} />
              Open in Explorer
            </button>
            <button
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px' }}
              onClick={handleRefresh}
            >
              <RefreshCw size={14} />
            </button>

            <div style={{ flex: 1 }} />

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter..."
                style={{
                  ...inputStyle,
                  width: 180,
                  paddingLeft: 30,
                  padding: '5px 12px 5px 30px',
                  fontSize: '0.83rem',
                }}
              />
            </div>
          </div>

          {/* File list — modern table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 150px 160px',
                padding: '12px 20px',
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid var(--table-border)',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}
            >
              <span>Name</span>
              <span style={{ textAlign: 'right' }}>Size</span>
              <span style={{ textAlign: 'right' }}>Modified</span>
              <span style={{ textAlign: 'center' }}>Actions</span>
            </div>

            {filteredContents.length === 0 ? (
              <div
                style={{
                  padding: 56,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                }}
              >
                <Folder
                  size={44}
                  style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: 16 }}
                />
                <div style={{ fontWeight: 500 }}>{search ? 'No matching items' : 'This folder is empty'}</div>
                <div style={{ fontSize: '0.8rem', marginTop: 6, opacity: 0.7 }}>
                  {search ? 'Try a different search term' : 'Create a new folder or add files via Explorer'}
                </div>
              </div>
            ) : (
              filteredContents.map((item, idx) => {
                const btnStyle = (color: string) => ({
                  background: 'none' as const, border: 'none' as const, cursor: 'pointer' as const,
                  color, padding: '6px 8px', borderRadius: 6, display: 'flex' as const, alignItems: 'center' as const,
                  transition: 'background 0.12s',
                })
                return (
                  <div
                    key={item.path}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 150px 160px',
                      padding: '10px 20px',
                      borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'}`,
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                      color: 'var(--text-primary)',
                      transition: 'background 0.12s',
                      background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)'),
                      alignItems: 'center',
                      minHeight: 48,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = isLight ? 'rgba(0,170,200,0.06)' : 'rgba(0,210,255,0.06)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.015)'))}
                    onDoubleClick={() => handleDoubleClickItem(item)}
                    onContextMenu={(e) => handleContentsContextMenu(e, item.path, item.isDirectory)}
                  >
                    {/* Name + icon */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                      <span style={{
                        width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: item.isDirectory ? 'rgba(255,176,32,0.12)' : (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,210,255,0.08)')
                      }}>
                        {item.isDirectory ? (
                          <Folder size={18} style={{ color: '#ffb020' }} />
                        ) : (
                          getFileIcon(item.name)
                        )}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: item.isDirectory ? 600 : 400 }}>
                        {item.name}
                      </span>
                    </span>

                    {/* Size */}
                    <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {!item.isDirectory && item.size != null ? formatSize(item.size) : '—'}
                    </span>

                    {/* Modified */}
                    <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {formatDate(item.modified)}
                    </span>

                    {/* Action buttons */}
                    <span style={{ display: 'flex', gap: 2, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      {!item.isDirectory ? (
                        <button onClick={() => handleOpenFile(item.path)} title="Open file"
                          style={btnStyle('var(--accent-primary)')}
                          onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,170,200,0.12)' : 'rgba(0,210,255,0.12)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <ExternalLink size={15} />
                        </button>
                      ) : (
                        <button onClick={() => handleSelectFolder(item.path)} title="Open folder"
                          style={btnStyle('#ffb020')}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,176,32,0.12)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <FolderOpen size={15} />
                        </button>
                      )}
                      <button onClick={() => { setRenameModal({ path: item.path, name: item.name }) }} title="Rename"
                        style={btnStyle('var(--text-secondary)')}
                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => { setMoveModal({ sourcePath: item.path }) }} title="Move"
                        style={btnStyle('var(--text-secondary)')}
                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <Move size={15} />
                      </button>
                      <button onClick={() => handleOpenInExplorer(item.path)} title="Show in Explorer"
                        style={btnStyle('var(--text-secondary)')}
                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <HardDrive size={15} />
                      </button>
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Status bar */}
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--table-border)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              gap: 16,
              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
            }}
          >
            <span>
              {filteredContents.filter((c) => c.isDirectory).length} folder
              {filteredContents.filter((c) => c.isDirectory).length !== 1 ? 's' : ''}
            </span>
            <span>·</span>
            <span>
              {filteredContents.filter((c) => !c.isDirectory).length} file
              {filteredContents.filter((c) => !c.isDirectory).length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ======================== Context Menu ======================== */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: isLight ? '#ffffff' : '#1a1d28',
            border: 'var(--glass-border)',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
            zIndex: 2000,
            minWidth: 180,
            padding: '4px 0',
            fontSize: '0.87rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isDir && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--bg-card-hover)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setRenameModal({ path: contextMenu.path, name: baseName(contextMenu.path) })
                  setContextMenu(null)
                }}
              >
                <Edit3 size={15} /> Rename
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--bg-card-hover)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setMoveModal({ sourcePath: contextMenu.path })
                  setMoveDestination(null)
                  setContextMenu(null)
                }}
              >
                <Move size={15} /> Move to...
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--bg-card-hover)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setNewFolderModal(contextMenu.path)
                  setNewFolderName('')
                  setContextMenu(null)
                }}
              >
                <FolderPlus size={15} /> New Subfolder
              </div>
            </>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--bg-card-hover)')
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              handleOpenInExplorer(contextMenu.path)
              setContextMenu(null)
            }}
          >
            <ExternalLink size={15} /> Open in Explorer
          </div>
        </div>
      )}

      {/* ======================== Rename Modal ======================== */}
      {renameModal && (
        <div style={modalBackdrop} onClick={() => setRenameModal(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalTitle}>
              <Edit3 size={18} style={{ color: 'var(--accent-primary)' }} />
              Rename
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                margin: '0 0 12px',
              }}
            >
              Enter a new name for <strong>{renameModal.name}</strong>
            </p>
            <input
              ref={renameInputRef}
              type="text"
              defaultValue={renameModal.name}
              style={inputStyle}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') setRenameModal(null)
              }}
            />
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                margin: '8px 0 0',
                fontStyle: 'italic',
              }}
            >
              Any file links pointing to this folder will be automatically updated.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button className="btn-secondary" onClick={() => setRenameModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleRename}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== Move Modal ======================== */}
      {moveModal && (
        <div style={modalBackdrop} onClick={() => setMoveModal(null)}>
          <div
            style={{ ...modalBox, maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalTitle}>
              <Move size={18} style={{ color: 'var(--accent-primary)' }} />
              Move Folder
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                margin: '0 0 12px',
              }}
            >
              Moving <strong>{baseName(moveModal.sourcePath)}</strong>. Select a destination folder:
            </p>

            <div
              style={{
                border: '1px solid var(--input-border)',
                borderRadius: 8,
                maxHeight: 300,
                overflowY: 'auto',
                padding: '6px 4px',
                background: 'var(--input-bg)',
              }}
            >
              {tree ? (
                <MoveTreeNode node={tree} depth={0} sourcePath={moveModal.sourcePath} />
              ) : (
                <div
                  style={{
                    padding: 16,
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Loading tree...
                </div>
              )}
            </div>

            {moveDestination && (
              <div
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(0,210,255,0.08)',
                  border: '1px solid rgba(0,210,255,0.2)',
                  fontSize: '0.83rem',
                  color: 'var(--text-primary)',
                }}
              >
                <strong>Destination:</strong> {moveDestination}
              </div>
            )}

            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                margin: '8px 0 0',
                fontStyle: 'italic',
              }}
            >
              File links under this folder will be automatically remapped.
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button className="btn-secondary" onClick={() => setMoveModal(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleMove}
                disabled={!moveDestination}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== New Folder Modal ======================== */}
      {newFolderModal && (
        <div style={modalBackdrop} onClick={() => setNewFolderModal(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalTitle}>
              <FolderPlus size={18} style={{ color: 'var(--accent-primary)' }} />
              New Folder
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                margin: '0 0 12px',
              }}
            >
              Create a new folder in <strong>{baseName(newFolderModal)}</strong>
            </p>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              style={inputStyle}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') setNewFolderModal(null)
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 20,
              }}
            >
              <button className="btn-secondary" onClick={() => setNewFolderModal(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== Health Check Modal ======================== */}
      {healthCheckResults && (
        <div style={modalBackdrop} onClick={() => setHealthCheckResults(null)}>
          <div
            style={{ ...modalBox, maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalTitle}>
              <Activity size={18} style={{ color: 'var(--accent-primary)' }} />
              File Link Health Check
            </div>

            {/* Summary */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(0,255,136,0.08)',
                  border: '1px solid rgba(0,255,136,0.2)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}
                >
                  {healthOk}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>OK</div>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background:
                    healthBroken > 0
                      ? 'rgba(255,77,77,0.08)'
                      : 'rgba(0,255,136,0.08)',
                  border: `1px solid ${healthBroken > 0 ? 'rgba(255,77,77,0.2)' : 'rgba(0,255,136,0.2)'}`,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    color: healthBroken > 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {healthBroken}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Broken
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-card)',
                  border: 'var(--glass-border)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}
                >
                  {healthTotal}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total</div>
              </div>
            </div>

            {/* Results list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid var(--input-border)',
                borderRadius: 8,
                background: 'var(--input-bg)',
              }}
            >
              {healthTotal === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                  }}
                >
                  No file links found in the database.
                </div>
              ) : (
                healthCheckResults.map((r, i) => (
                  <div
                    key={`${r.table}-${r.id}-${r.column}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderBottom:
                        i < healthCheckResults.length - 1
                          ? '1px solid var(--table-border)'
                          : 'none',
                      fontSize: '0.83rem',
                    }}
                  >
                    {r.exists ? (
                      <CheckCircle size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    ) : (
                      <XCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.path}
                      >
                        {r.label || baseName(r.path)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.path}
                      >
                        {r.path}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: r.exists
                          ? 'rgba(0,255,136,0.1)'
                          : 'rgba(255,77,77,0.1)',
                        color: r.exists ? 'var(--success)' : 'var(--danger)',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {r.exists ? 'OK' : 'MISSING'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 16,
              }}
            >
              <button className="btn-secondary" onClick={() => setHealthCheckResults(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== Settings Modal ======================== */}
      {showSettings && (
        <div style={modalBackdrop} onClick={() => setShowSettings(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={modalTitle}>
              <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
              File Manager Settings
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                margin: '0 0 16px',
              }}
            >
              Configure the root document folder. All files and folders will be displayed
              relative to this path.
            </p>

            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Root Folder Path
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newRootInput}
                onChange={(e) => setNewRootInput(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRoot()
                }}
              />
              <button className="btn-secondary" onClick={handleBrowseRoot}>
                Browse
              </button>
            </div>

            {rootPath && (
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  margin: '8px 0 0',
                }}
              >
                Current: <code style={{ color: 'var(--accent-primary)' }}>{rootPath}</code>
              </p>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 24,
              }}
            >
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveRoot}
                disabled={!newRootInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
