import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { PageHeader, Tabs } from './ui'
import PremiumCalculator from './PremiumCalculator'
import TLORateCalculator from './TLORateCalculator'
import WarBreachCalculator from './WarBreachCalculator'

type CalculatorType = 'premium' | 'tlo' | 'warbreach'

const calculators: { id: CalculatorType; label: string; description: string }[] = [
  { id: 'premium', label: 'Pro-Rata Premium', description: 'Calculate pro-rata premiums with instalment and commission breakdowns' },
  { id: 'tlo', label: 'TLO Rate', description: 'Calculate Total Loss Only premium based on vessel value changes' },
  { id: 'warbreach', label: 'War Breach', description: 'Compute war/breach premiums with Lebanese government taxes' }
]

export default function Calculators() {
  const [activeCalc, setActiveCalc] = useState<CalculatorType>('premium')

  return (
    <div className="fade-in page">
      <PageHeader icon={<Calculator size={26} />} title="Calculators" subtitle="Insurance calculation tools" />

      <Tabs
        style={{ marginBottom: '24px' }}
        value={activeCalc}
        onChange={setActiveCalc}
        items={calculators.map(c => ({ key: c.id, label: c.label }))}
      />

      {activeCalc === 'premium' && <PremiumCalculator />}
      {activeCalc === 'tlo' && <TLORateCalculator />}
      {activeCalc === 'warbreach' && <WarBreachCalculator />}
    </div>
  )
}
