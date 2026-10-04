import { useState, lazy, Suspense } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import {
  FileBarChart2,
  Database,
  Users,
  ClipboardCheck,
  CalendarClock,
  Receipt,
  type LucideIcon
} from 'lucide-react'
import { PageHeader, Tabs } from './ui'
import LossRecordReport from './LossRecordReport'
import StatementReport from './StatementReport'
import CustomerComplianceReport from './CustomerComplianceReport'
import AssuredReport from './AssuredReport'
import ConditionSurveyReport from './ConditionSurveyReport'
import RenewalPipelineReport from './RenewalPipelineReport'

const ReportBuilder = lazy(() => import('./ReportBuilder'))

type ReportTab =
  | 'report-builder'
  | 'loss-record'
  | 'statement'
  | 'customer-compliance'
  | 'assured-report'
  | 'condition-survey'
  | 'renewal-pipeline'

const TABS: { id: ReportTab; label: string; icon: LucideIcon }[] = [
  { id: 'report-builder', label: 'Report Builder', icon: Database },
  { id: 'loss-record', label: 'Loss Record', icon: FileBarChart2 },
  { id: 'statement', label: 'Statement of Account', icon: Receipt },
  { id: 'customer-compliance', label: 'Customer Compliance', icon: FileBarChart2 },
  { id: 'assured-report', label: 'Assured Report', icon: Users },
  { id: 'condition-survey', label: 'Condition Surveys', icon: ClipboardCheck },
  { id: 'renewal-pipeline', label: 'Renewal Pipeline', icon: CalendarClock }
]

export default function Reports({ subTab, subTabNonce }: SubTabProps = {}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ReportTab>('report-builder')
  useRequestedSubTab(
    subTab,
    subTabNonce,
    TABS.map((t) => t.id),
    setActiveTab
  )

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<FileBarChart2 size={26} />}
        title="Reports"
        subtitle="Generate and export compliance, renewal and loss reports."
      />

      <Tabs
        style={{ marginBottom: '24px' }}
        value={activeTab}
        onChange={setActiveTab}
        items={TABS.map((t) => ({ key: t.id, label: t.label, icon: <t.icon size={16} /> }))}
      />

      {activeTab === 'report-builder' && (
        <Suspense
          fallback={
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          }
        >
          <ReportBuilder />
        </Suspense>
      )}
      {activeTab === 'loss-record' && <LossRecordReport />}
      {activeTab === 'statement' && <StatementReport />}
      {activeTab === 'customer-compliance' && <CustomerComplianceReport />}
      {activeTab === 'assured-report' && <AssuredReport />}
      {activeTab === 'condition-survey' && <ConditionSurveyReport />}
      {activeTab === 'renewal-pipeline' && <RenewalPipelineReport />}
    </div>
  )
}
