import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import { Extension, Node as TipTapNode } from '@tiptap/react'
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, ChevronDown, WrapText, Link as LinkIcon, Unlink } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import './RichTextEditor.css'

// Custom FontFamily extension using TextStyle marks
const FontFamily = Extension.create({
  name: 'fontFamily',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontFamily?.replace(/['"]+/g, '') || null,
          renderHTML: attrs => {
            if (!attrs.fontFamily) return {}
            return { style: `font-family: ${attrs.fontFamily}` }
          }
        }
      }
    }]
  }
})

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
]

// Custom FontSize extension using TextStyle marks
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.fontSize?.replace(/['"]+/g, '') || null,
          renderHTML: attrs => {
            if (!attrs.fontSize) return {}
            return { style: `font-size: ${attrs.fontSize}` }
          }
        }
      }
    }]
  }
})

// Custom LineHeight extension on paragraph nodes
const LineHeight = TipTapNode.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: el => (el as HTMLElement).style.lineHeight || null,
          renderHTML: attrs => {
            if (!attrs.lineHeight) return {}
            return { style: `line-height: ${attrs.lineHeight}` }
          }
        }
      }
    }]
  }
})

const FONT_SIZES = [
  { label: '8', value: '8pt' },
  { label: '9', value: '9pt' },
  { label: '10', value: '10pt' },
  { label: '11', value: '11pt' },
  { label: '12', value: '12pt' },
  { label: '14', value: '14pt' },
  { label: '16', value: '16pt' },
  { label: '18', value: '18pt' },
  { label: '20', value: '20pt' },
  { label: '24', value: '24pt' },
]

const LINE_SPACINGS = [
  { label: 'None', value: '0.9' },
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
  { label: '2.5', value: '2.5' },
  { label: '3.0', value: '3' },
]

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  maxWidth?: string
  showFontSize?: boolean
  showFontFamily?: boolean
  showAlignment?: boolean
  showLineSpacing?: boolean
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 80, maxWidth, showFontSize, showFontFamily, showAlignment, showLineSpacing }: RichTextEditorProps) {
  const { theme } = useTheme()
  const iconColor = useMemo(() => theme !== 'dark' ? '#606770' : 'rgba(255,255,255,0.6)', [theme])
  const activeIconColor = '#ffffff'
  const skipUpdate = useRef(false)
  const [fontSizeOpen, setFontSizeOpen] = useState(false)
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false)
  const [lineSpacingOpen, setLineSpacingOpen] = useState(false)
  const fontSizeRef = useRef<HTMLDivElement>(null)
  const fontFamilyRef = useRef<HTMLDivElement>(null)
  const lineSpacingRef = useRef<HTMLDivElement>(null)

  const extensions = useMemo(() => {
    const exts: any[] = [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
      })
    ]
    if (showFontSize || showFontFamily) {
      exts.push(TextStyle)
      if (showFontSize) exts.push(FontSize)
      if (showFontFamily) exts.push(FontFamily)
    }
    if (showAlignment) {
      exts.push(TextAlign.configure({ types: ['paragraph'] }))
    }
    if (showLineSpacing) {
      exts.push(LineHeight)
    }
    return exts
  }, [showFontSize, showFontFamily, showAlignment, showLineSpacing])

  const editor = useEditor({
    extensions,
    content: value || '',
    immediatelyRender: true,
    onUpdate: ({ editor: e }) => {
      skipUpdate.current = true
      const html = e.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    }
  })

  useEffect(() => {
    if (!editor) return
    if (skipUpdate.current) {
      skipUpdate.current = false
      return
    }
    const currentHtml = editor.getHTML()
    if (value !== currentHtml && !(value === '' && currentHtml === '<p></p>')) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!fontSizeOpen && !fontFamilyOpen && !lineSpacingOpen) return
    const handler = (e: MouseEvent) => {
      if (fontSizeOpen && fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setFontSizeOpen(false)
      if (fontFamilyOpen && fontFamilyRef.current && !fontFamilyRef.current.contains(e.target as Node)) setFontFamilyOpen(false)
      if (lineSpacingOpen && lineSpacingRef.current && !lineSpacingRef.current.contains(e.target as Node)) setLineSpacingOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fontSizeOpen, fontFamilyOpen, lineSpacingOpen])

  const toggleLink = useCallback(() => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('Enter URL:')
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean) => `rte-btn${active ? ' rte-btn-active' : ''}`

  const currentFontSize = (editor.getAttributes('textStyle') as any).fontSize || ''
  const fontSizeLabel = currentFontSize ? currentFontSize.replace('pt', '') : '–'

  const currentLineHeight = (editor.getAttributes('paragraph') as any).lineHeight || ''

  const setFontSize = (size: string) => {
    editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
    setFontSizeOpen(false)
  }

  const currentFontFamily = (editor.getAttributes('textStyle') as any).fontFamily || ''
  const fontFamilyLabel = currentFontFamily
    ? FONT_FAMILIES.find(f => f.value === currentFontFamily)?.label || 'Custom'
    : 'Font'

  const setFontFamily = (family: string) => {
    if (family) {
      editor.chain().focus().setMark('textStyle', { fontFamily: family }).run()
    } else {
      editor.chain().focus().unsetMark('textStyle').run()
    }
    setFontFamilyOpen(false)
  }

  const setLineHeight = (lh: string) => {
    editor.chain().focus().updateAttributes('paragraph', { lineHeight: lh }).run()
    setLineSpacingOpen(false)
  }

  const isLinkActive = editor.isActive('link')

  return (
    <div className="rte-wrapper" style={{ maxWidth: maxWidth || '100%' }}>
      <div className="rte-toolbar">
        {showFontSize && (
          <>
            <div ref={fontSizeRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="rte-btn rte-font-size-btn"
                onClick={() => setFontSizeOpen(!fontSizeOpen)}
                title="Font Size"
              >
                <span style={{ fontSize: '11px', color: iconColor, fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{fontSizeLabel}</span>
                <ChevronDown size={10} color={iconColor} />
              </button>
              {fontSizeOpen && (
                <div className="rte-font-size-dropdown">
                  {FONT_SIZES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      className={`rte-font-size-option${currentFontSize === s.value ? ' active' : ''}`}
                      onClick={() => setFontSize(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rte-separator" />
          </>
        )}
        {showFontFamily && (
          <>
            <div ref={fontFamilyRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="rte-btn rte-font-size-btn"
                onClick={() => setFontFamilyOpen(!fontFamilyOpen)}
                title="Font Family"
                style={{ minWidth: '70px' }}
              >
                <span style={{ fontSize: '11px', color: iconColor, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{fontFamilyLabel}</span>
                <ChevronDown size={10} color={iconColor} />
              </button>
              {fontFamilyOpen && (
                <div className="rte-font-size-dropdown" style={{ minWidth: '160px' }}>
                  {FONT_FAMILIES.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      className={`rte-font-size-option${currentFontFamily === f.value ? ' active' : ''}`}
                      onClick={() => setFontFamily(f.value)}
                      style={{ fontFamily: f.value || 'inherit' }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rte-separator" />
          </>
        )}
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold size={14} color={editor.isActive('bold') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic size={14} color={editor.isActive('italic') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon size={14} color={editor.isActive('underline') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(isLinkActive)} onClick={toggleLink} title={isLinkActive ? 'Remove Link' : 'Add Link'}>
          {isLinkActive
            ? <Unlink size={14} color={activeIconColor} strokeWidth={2.5} />
            : <LinkIcon size={14} color={iconColor} strokeWidth={2.5} />
          }
        </button>
        <div className="rte-separator" />
        {showAlignment && (
          <>
            <button type="button" className={btn(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left">
              <AlignLeft size={14} color={editor.isActive({ textAlign: 'left' }) ? activeIconColor : iconColor} strokeWidth={2.5} />
            </button>
            <button type="button" className={btn(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align Center">
              <AlignCenter size={14} color={editor.isActive({ textAlign: 'center' }) ? activeIconColor : iconColor} strokeWidth={2.5} />
            </button>
            <button type="button" className={btn(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right">
              <AlignRight size={14} color={editor.isActive({ textAlign: 'right' }) ? activeIconColor : iconColor} strokeWidth={2.5} />
            </button>
            <div className="rte-separator" />
          </>
        )}
        {showLineSpacing && (
          <>
            <div ref={lineSpacingRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="rte-btn rte-font-size-btn"
                onClick={() => setLineSpacingOpen(!lineSpacingOpen)}
                title="Line Spacing"
              >
                <WrapText size={14} color={iconColor} strokeWidth={2} />
                <ChevronDown size={10} color={iconColor} />
              </button>
              {lineSpacingOpen && (
                <div className="rte-font-size-dropdown">
                  {LINE_SPACINGS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      className={`rte-font-size-option${currentLineHeight === s.value ? ' active' : ''}`}
                      onClick={() => setLineHeight(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rte-separator" />
          </>
        )}
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">
          <List size={14} color={editor.isActive('bulletList') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">
          <ListOrdered size={14} color={editor.isActive('orderedList') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
      </div>
      <div className="rte-content" style={{ minHeight }} data-placeholder={placeholder || ''}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
