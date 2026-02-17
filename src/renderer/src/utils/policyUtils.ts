import { VesselDynamicPolicy } from '../../../shared/types'

/**
 * Resolves the effective policy expiry date for a vessel based on its active dynamic policies.
 * Logic:
 * 1. Look for an active P&I policy. Use its "End Date" if available.
 * 2. If no P&I, look for an active Hull policy. Use its "End Date" if available.
 * 3. Return undefined if none found.
 */
export function resolveEffectivePolicyExpiry(policies: VesselDynamicPolicy[]): string | undefined {
  if (!policies || policies.length === 0) return undefined

  const activePolicies = policies.filter(p => p.status === 'active')

  // 1. Priority 1: P&I Policy
  const piPolicy = activePolicies.find(p => 
    p.policyTypeName?.toLowerCase().includes('p&i') || 
    p.policyTypeName?.toLowerCase().includes('protection')
  )
  
  if (piPolicy) {
    const endDateVal = piPolicy.values?.find(v => 
      v.characteristicName?.toLowerCase().includes('end date')
    )
    if (endDateVal?.valueDate) return endDateVal.valueDate
  }

  // 2. Priority 2: Hull & Machinery
  const hullPolicy = activePolicies.find(p => 
    p.policyTypeName?.toLowerCase().includes('hull') || 
    p.policyTypeName?.toLowerCase().includes('h&m')
  )
  
  if (hullPolicy) {
    const endDateVal = hullPolicy.values?.find(v => 
      v.characteristicName?.toLowerCase().includes('end date')
    )
    if (endDateVal?.valueDate) return endDateVal.valueDate
  }

  return undefined
}

/**
 * Resolves the effective policy inception date (Inception Date).
 */
export function resolveEffectivePolicyInception(policies: VesselDynamicPolicy[]): string | undefined {
  if (!policies || policies.length === 0) return undefined

  const activePolicies = policies.filter(p => p.status === 'active')

  // Priority logic matches expiry
  const piPolicy = activePolicies.find(p => 
    p.policyTypeName?.toLowerCase().includes('p&i') || 
    p.policyTypeName?.toLowerCase().includes('protection')
  )
  
  if (piPolicy) {
    const inceptionDateVal = piPolicy.values?.find(v => 
      v.characteristicName?.toLowerCase().includes('inception date')
    )
    if (inceptionDateVal?.valueDate) return inceptionDateVal.valueDate
  }

  const hullPolicy = activePolicies.find(p => 
    p.policyTypeName?.toLowerCase().includes('hull') || 
    p.policyTypeName?.toLowerCase().includes('h&m')
  )
  
  if (hullPolicy) {
    const inceptionDateVal = hullPolicy.values?.find(v => 
      v.characteristicName?.toLowerCase().includes('inception date')
    )
    if (inceptionDateVal?.valueDate) return inceptionDateVal.valueDate
  }

  return undefined
}
