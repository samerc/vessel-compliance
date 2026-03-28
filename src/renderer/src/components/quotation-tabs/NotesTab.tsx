import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Quotation, QuotationNote } from '../../../../shared/types'
import { useAuth } from '../../contexts/AuthContext'

export default function NotesTab({ quotation, showSuccess, isLight }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [notes, setNotes] = useState<QuotationNote[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyContent, setReplyContent] = useState('')
    const [allUsers, setAllUsers] = useState<{ id: string; username: string }[]>([])
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionAnchorEl, setMentionAnchorEl] = useState<HTMLTextAreaElement | null>(null)
    const { user } = useAuth()

    useEffect(() => { loadData() }, [])
    useEffect(() => {
        window.api.notificationsGetUsernames()
            .then(data => { if (Array.isArray(data)) setAllUsers(data) })
            .catch(() => {
                // Fallback: try getUsers if available
                window.api.getUsers?.()
                    .then((users: any[]) => setAllUsers(users.map(u => ({ id: u.id, username: u.username }))))
                    .catch(() => {})
            })
    }, [])

    const loadData = async () => {
        const raw = await window.api.getQuotationNotes(quotation.id)
        setNotes(Array.isArray(raw) ? raw : [])
    }

    const handleAdd = async () => {
        if (!newTitle.trim()) return
        await window.api.addQuotationNote({ quotationId: quotation.id, title: newTitle, content: newContent, order: notes.length })
        setNewTitle(''); setNewContent('')
        showSuccess('Note added')
        loadData()
    }

    const handleReply = async (parentNoteId: string) => {
        if (!replyContent.trim()) return
        await window.api.addQuotationNote({
            quotationId: quotation.id,
            title: 'Reply',
            content: replyContent,
            order: 0,
            parentNoteId,
        })
        setReplyContent('')
        setReplyingTo(null)
        showSuccess('Reply added')
        loadData()
    }

    const handleUpdate = async (id: string, updates: { title?: string; content?: string }) => {
        await window.api.updateQuotationNote(id, updates)
    }

    const handleMentionInput = (e: React.ChangeEvent<HTMLTextAreaElement>, setter: (v: string) => void) => {
        const val = e.target.value
        setter(val)
        // Check for @mention
        const cursorPos = e.target.selectionStart || 0
        const textBefore = val.slice(0, cursorPos)
        const atMatch = textBefore.match(/@(\w*)$/)
        if (atMatch) {
            setMentionQuery(atMatch[1].toLowerCase())
            setMentionAnchorEl(e.target)
        } else {
            setMentionQuery(null)
            setMentionAnchorEl(null)
        }
    }

    const insertMention = (username: string, setter: (v: string) => void, getter: string) => {
        if (!mentionAnchorEl) return
        const cursorPos = mentionAnchorEl.selectionStart || 0
        const textBefore = getter.slice(0, cursorPos)
        const atMatch = textBefore.match(/@(\w*)$/)
        if (atMatch) {
            const beforeAt = textBefore.slice(0, textBefore.length - atMatch[0].length)
            const after = getter.slice(cursorPos)
            setter(beforeAt + '@' + username + ' ' + after)
        }
        setMentionQuery(null)
        setMentionAnchorEl(null)
    }

    const filteredUsers = mentionQuery !== null
        ? allUsers.filter(u => u.username.toLowerCase().includes(mentionQuery) && u.id !== user?.id).slice(0, 6)
        : []

    // Build threaded structure
    const parentNotes = notes.filter(n => !n.parentNoteId)
    const repliesMap = new Map<string, QuotationNote[]>()
    for (const n of notes) {
        if (n.parentNoteId) {
            const existing = repliesMap.get(n.parentNoteId) || []
            existing.push(n)
            repliesMap.set(n.parentNoteId, existing)
        }
    }

    const renderMentionDropdown = (setter: (v: string) => void, getter: string) => {
        if (mentionQuery === null || filteredUsers.length === 0) return null
        return (
            <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                background: isLight ? '#ffffff' : '#1a1d28',
                border: '1px solid var(--glass-border)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 100,
                maxHeight: '150px',
                overflowY: 'auto',
                minWidth: '160px',
            }}>
                {filteredUsers.map(u => (
                    <div key={u.id}
                        onClick={() => insertMention(u.username, setter, getter)}
                        style={{
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            color: 'var(--text-primary)',
                        }}
                        className="hover-effect"
                    >
                        @{u.username}
                    </div>
                ))}
            </div>
        )
    }

    const highlightMentions = (text: string) => {
        if (!text) return text
        const parts = text.split(/(@\w+)/g)
        return parts.map((part, i) =>
            part.startsWith('@')
                ? <span key={i} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{part}</span>
                : part
        )
    }

    const formatTime = (dateStr?: string | null) => {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - d.getTime()
        const diffMin = Math.floor(diffMs / 60000)
        if (diffMin < 1) return 'just now'
        if (diffMin < 60) return `${diffMin}m ago`
        const diffHour = Math.floor(diffMin / 60)
        if (diffHour < 24) return `${diffHour}h ago`
        return d.toLocaleDateString()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Additional Notes</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Internal notes for this quotation. Notes are not included in exports. Use @username to mention someone.
            </p>
            <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)', position: 'relative' }}>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Note title" style={{ width: '100%', marginBottom: '8px', fontWeight: 600 }} />
                <div style={{ position: 'relative' }}>
                    <textarea value={newContent} onChange={e => handleMentionInput(e, setNewContent)} placeholder="Note content... (use @ to mention)" style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                    {renderMentionDropdown(setNewContent, newContent)}
                </div>
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add Note</button>
            </div>
            {parentNotes.map(note => {
                const replies = repliesMap.get(note.id) || []
                return (
                    <div key={note.id} style={{ marginBottom: '14px' }}>
                        {/* Parent note */}
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <input type="text" defaultValue={note.title} onBlur={e => handleUpdate(note.id, { title: e.target.value })} style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }} />
                                <button onClick={async () => { await window.api.deleteQuotationNote(note.id); showSuccess('Note deleted'); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                            </div>
                            <textarea defaultValue={note.content} onBlur={e => handleUpdate(note.id, { content: e.target.value })} style={{ width: '100%', minHeight: '60px', resize: 'vertical', fontSize: '0.85rem' }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    {note.authorUsername && <span style={{ fontWeight: 600 }}>{note.authorUsername}</span>}
                                    {note.createdAt && <span style={{ marginLeft: '6px' }}>{formatTime(note.createdAt)}</span>}
                                </div>
                                <button
                                    onClick={() => setReplyingTo(replyingTo === note.id ? null : note.id)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    Reply {replies.length > 0 && `(${replies.length})`}
                                </button>
                            </div>
                        </div>

                        {/* Replies */}
                        {replies.length > 0 && (
                            <div style={{ marginLeft: '24px', borderLeft: '2px solid var(--accent-primary)', paddingLeft: '12px', marginTop: '4px' }}>
                                {replies.map(reply => (
                                    <div key={reply.id} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--table-border)', marginTop: '4px', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                {reply.authorUsername && <span style={{ fontWeight: 600 }}>{reply.authorUsername}</span>}
                                                {reply.createdAt && <span style={{ marginLeft: '6px' }}>{formatTime(reply.createdAt)}</span>}
                                            </div>
                                            <button onClick={async () => { await window.api.deleteQuotationNote(reply.id); showSuccess('Reply deleted'); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={12} /></button>
                                        </div>
                                        <div style={{ lineHeight: 1.5 }}>{highlightMentions(reply.content)}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reply input */}
                        {replyingTo === note.id && (
                            <div style={{ marginLeft: '24px', paddingLeft: '12px', marginTop: '6px', position: 'relative' }}>
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        value={replyContent}
                                        onChange={e => handleMentionInput(e, setReplyContent)}
                                        placeholder="Write a reply... (use @ to mention)"
                                        style={{ width: '100%', minHeight: '50px', resize: 'vertical', fontSize: '0.85rem', marginBottom: '6px' }}
                                        autoFocus
                                    />
                                    {renderMentionDropdown(setReplyContent, replyContent)}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleReply(note.id)} className="btn-primary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>Reply</button>
                                    <button onClick={() => { setReplyingTo(null); setReplyContent('') }} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

