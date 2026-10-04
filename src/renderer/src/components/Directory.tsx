import { useState } from 'react'
import { Users, ClipboardList, Flag, BookOpen } from 'lucide-react'
import EntityDirectory from './EntityDirectory'
import SurveyorDirectory from './SurveyorDirectory'
import FlagStateDirectory from './FlagStateDirectory'
import DynamicAddressBook from './DynamicAddressBook'
import { PageHeader, Tabs } from './ui'

interface DirectoryProps {
    onNavigateToVessel?: (vesselId: string) => void
    initialEntityId?: string | null
    onInitialEntityConsumed?: () => void
    openCreate?: boolean
    onCreateConsumed?: () => void
}

export default function Directory({ onNavigateToVessel, initialEntityId, onInitialEntityConsumed, openCreate, onCreateConsumed }: DirectoryProps) {
    const [activeView, setActiveView] = useState<'entities' | 'surveyors' | 'flag-states' | 'address-book'>('entities')

    return (
        <div className="fade-in page">
            <PageHeader
                icon={<BookOpen size={26} />}
                title="Directory"
                subtitle="Entities, surveyors, flag states, and the contact address book."
            />
            <Tabs
                style={{ marginBottom: '24px' }}
                value={activeView}
                onChange={setActiveView}
                items={[
                    { key: 'entities', label: 'Entities', icon: <Users size={16} /> },
                    { key: 'surveyors', label: 'Surveyors', icon: <ClipboardList size={16} /> },
                    { key: 'flag-states', label: 'Flag States', icon: <Flag size={16} /> },
                    { key: 'address-book', label: 'Address Book', icon: <BookOpen size={16} /> }
                ]}
            />

            {/* Active view content */}
            {activeView === 'entities' && <EntityDirectory initialEntityId={initialEntityId} onInitialEntityConsumed={onInitialEntityConsumed} openCreate={openCreate} onCreateConsumed={onCreateConsumed} />}
            {activeView === 'surveyors' && <SurveyorDirectory />}
            {activeView === 'flag-states' && <FlagStateDirectory onNavigateToVessel={onNavigateToVessel} />}
            {activeView === 'address-book' && <DynamicAddressBook />}
        </div>
    )
}
