import { useState } from 'react'
import { FileBarChart2 } from 'lucide-react'
import LossRecordReport from './LossRecordReport'

type ReportTab = 'loss-record'

const TABS: { id: ReportTab; label: string; description: string }[] = [
  { id: 'loss-record', label: 'Loss Record', description: 'Import an Excel loss record and export a formatted PDF report' }
]

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>('loss-record')

  return (
    <div className="fade-in">
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Reports</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Generate formatted reports from imported data.</p>
      </header>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: activeTab === tab.id ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
              background: activeTab === tab.id ? 'rgba(var(--accent-primary-rgb, 0,210,255),0.08)' : 'var(--bg-card)',
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
            <FileBarChart2 size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'loss-record' && <LossRecordReport />}
    </div>
  )
}
