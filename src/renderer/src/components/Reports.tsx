import { useState, lazy, Suspense } from 'react'
import { FileBarChart2, Database, Users, ClipboardCheck } from 'lucide-react'
import LossRecordReport from './LossRecordReport'
import CustomerComplianceReport from './CustomerComplianceReport'
import AssuredReport from './AssuredReport'
import ConditionSurveyReport from './ConditionSurveyReport'

const ReportBuilder = lazy(() => import('./ReportBuilder'))

type ReportTab = 'report-builder' | 'loss-record' | 'customer-compliance' | 'assured-report' | 'condition-survey'

const TABS: { id: ReportTab; label: string; icon: any }[] = [
  { id: 'report-builder', label: 'Report Builder', icon: Database },
  { id: 'loss-record', label: 'Loss Record', icon: FileBarChart2 },
  { id: 'customer-compliance', label: 'Customer Compliance', icon: FileBarChart2 },
  { id: 'assured-report', label: 'Assured Report', icon: Users },
  { id: 'condition-survey', label: 'Condition Surveys', icon: ClipboardCheck }
]

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>('report-builder')

  return (
    <div className="fade-in">
      {activeTab !== 'report-builder' && (
        <header style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Reports</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Generate and export compliance and loss reports.
          </p>
        </header>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border:
                  activeTab === tab.id
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--glass-border)',
                background:
                  activeTab === tab.id
                    ? 'rgba(var(--accent-primary-rgb, 0,210,255),0.08)'
                    : 'var(--bg-card)',
                color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? '600' : '400',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'var(--transition)'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

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
      {activeTab === 'customer-compliance' && <CustomerComplianceReport />}
      {activeTab === 'assured-report' && <AssuredReport />}
      {activeTab === 'condition-survey' && <ConditionSurveyReport />}
    </div>
  )
}
