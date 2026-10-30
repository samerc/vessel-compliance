import { useState } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import { Calculator } from 'lucide-react'
import { KeepAlive, PageHeader, Tabs } from './ui'
import PremiumCalculator from './PremiumCalculator'
import TLORateCalculator from './TLORateCalculator'
import WarBreachCalculator from './WarBreachCalculator'
import SeaTransitCalculator from './SeaTransitCalculator'

type CalculatorType = 'premium' | 'tlo' | 'warbreach' | 'transit'

const calculators: { id: CalculatorType; label: string; description: string }[] = [
  {
    id: 'premium',
    label: 'Pro-Rata Premium',
    description: 'Calculate pro-rata premiums with instalment and commission breakdowns'
  },
  {
    id: 'tlo',
    label: 'TLO Rate',
    description: 'Calculate Total Loss Only premium based on vessel value changes'
  },
  {
    id: 'warbreach',
    label: 'War Breach',
    description: 'Compute war/breach premiums with Lebanese government taxes'
  },
  {
    id: 'transit',
    label: 'Sea Transit',
    description: 'Estimate the days at sea between two ports, e.g. for a cargo transit'
  }
]

export default function Calculators({ subTab, subTabNonce }: SubTabProps = {}): React.JSX.Element {
  const [activeCalc, setActiveCalc] = useState<CalculatorType>('premium')
  useRequestedSubTab(
    subTab,
    subTabNonce,
    ['premium', 'tlo', 'warbreach', 'transit'] as const,
    setActiveCalc
  )

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<Calculator size={26} />}
        title="Calculators"
        subtitle="Insurance calculation tools"
      />

      <Tabs
        style={{ marginBottom: '24px' }}
        value={activeCalc}
        onChange={setActiveCalc}
        items={calculators.map((c) => ({ key: c.id, label: c.label }))}
      />
      <p style={{ color: 'var(--text-secondary)', margin: '-12px 0 16px', fontSize: '0.88rem' }}>
        {calculators.find((c) => c.id === activeCalc)?.description}
      </p>

      {/* Opened calculators stay mounted: switching tabs keeps the figures entered */}
      <KeepAlive
        active={activeCalc}
        panes={{
          premium: () => <PremiumCalculator />,
          tlo: () => <TLORateCalculator />,
          warbreach: () => <WarBreachCalculator />,
          transit: () => <SeaTransitCalculator />
        }}
      />
    </div>
  )
}
