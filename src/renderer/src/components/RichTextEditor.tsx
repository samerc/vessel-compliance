import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useEffect, useRef, useMemo } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import './RichTextEditor.css'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  maxWidth?: string
}

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 80, maxWidth }: RichTextEditorProps) {
  const { theme } = useTheme()
  const iconColor = useMemo(() => theme === 'light' ? '#606770' : 'rgba(255,255,255,0.6)', [theme])
  const activeIconColor = '#ffffff'
  const skipUpdate = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false
      }),
      Underline
    ],
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

  if (!editor) return null

  const btn = (active: boolean) => `rte-btn${active ? ' rte-btn-active' : ''}`

  return (
    <div className="rte-wrapper" style={{ maxWidth: maxWidth || '100%' }}>
      <div className="rte-toolbar">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold size={14} color={editor.isActive('bold') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic size={14} color={editor.isActive('italic') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <button type="button" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon size={14} color={editor.isActive('underline') ? activeIconColor : iconColor} strokeWidth={2.5} />
        </button>
        <div className="rte-separator" />
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
