import { useState } from 'react'
import { Users, ClipboardList, Flag, BookOpen } from 'lucide-react'
import EntityDirectory from './EntityDirectory'
import SurveyorDirectory from './SurveyorDirectory'
import FlagStateDirectory from './FlagStateDirectory'
import DynamicAddressBook from './DynamicAddressBook'

interface DirectoryProps {
    onNavigateToVessel?: (vesselId: string) => void
    initialEntityId?: string | null
    onInitialEntityConsumed?: () => void
}

export default function Directory({ onNavigateToVessel, initialEntityId, onInitialEntityConsumed }: DirectoryProps) {
    const [activeView, setActiveView] = useState<'entities' | 'surveyors' | 'flag-states' | 'address-book'>('entities')

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Directory</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage entities, surveyors, and flag states.</p>
            </header>

            {/* Sub-navigation tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--table-border)', paddingBottom: '0' }}>
                <button
                    onClick={() => setActiveView('entities')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'entities' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: activeView === 'entities' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: activeView === 'entities' ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'var(--transition)',
                        marginBottom: '-1px'
                    }}
                >
                    <Users size={18} /> Entities
                </button>
                <button
                    onClick={() => setActiveView('surveyors')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'surveyors' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: activeView === 'surveyors' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: activeView === 'surveyors' ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'var(--transition)',
                        marginBottom: '-1px'
                    }}
                >
                    <ClipboardList size={18} /> Surveyors
                </button>
                <button
                    onClick={() => setActiveView('flag-states')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'flag-states' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: activeView === 'flag-states' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: activeView === 'flag-states' ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'var(--transition)',
                        marginBottom: '-1px'
                    }}
                >
                    <Flag size={18} /> Flag States
                </button>
                <button
                    onClick={() => setActiveView('address-book')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeView === 'address-book' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        color: activeView === 'address-book' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontWeight: activeView === 'address-book' ? '600' : '400',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        transition: 'var(--transition)',
                        marginBottom: '-1px'
                    }}
                >
                    <BookOpen size={18} /> Address Book
                </button>
            </div>

            {/* Active view content */}
            {activeView === 'entities' && <EntityDirectory initialEntityId={initialEntityId} onInitialEntityConsumed={onInitialEntityConsumed} />}
            {activeView === 'surveyors' && <SurveyorDirectory />}
            {activeView === 'flag-states' && <FlagStateDirectory onNavigateToVessel={onNavigateToVessel} />}
            {activeView === 'address-book' && <DynamicAddressBook />}
        </div>
    )
}
