import { useState } from 'react'
import { Calculator } from 'lucide-react'
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
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calculator size={28} /> Calculators
        </h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Insurance calculation tools
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        {calculators.map(calc => (
          <button
            key={calc.id}
            onClick={() => setActiveCalc(calc.id)}
            className={activeCalc !== calc.id ? 'hover-effect' : ''}
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              border: activeCalc === calc.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
              background: activeCalc === calc.id ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
              color: activeCalc === calc.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: activeCalc === calc.id ? '600' : '400',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              transition: 'var(--transition)'
            }}
          >
            {calc.label}
          </button>
        ))}
      </div>

      {activeCalc === 'premium' && <PremiumCalculator />}
      {activeCalc === 'tlo' && <TLORateCalculator />}
      {activeCalc === 'warbreach' && <WarBreachCalculator />}
    </div>
  )
}
