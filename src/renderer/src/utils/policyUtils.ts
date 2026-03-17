import { VesselDynamicPolicy } from '../../../shared/types'

function getEndDate(policy: VesselDynamicPolicy): string | undefined {
  const endDateVal = policy.values?.find(v => {
    const name = v.characteristicName?.toLowerCase() || ''
    return name.includes('end') && (name.includes('date') || name.includes('expir'))
  })
  return endDateVal?.valueDate || undefined
}

function isPIPolicy(p: VesselDynamicPolicy): boolean {
  const name = p.policyTypeName?.toLowerCase() || ''
  return name.includes('p&i') || name.includes('protection') || name.includes('p & i')
}

function isHullPolicy(p: VesselDynamicPolicy): boolean {
  const name = p.policyTypeName?.toLowerCase() || ''
  return name.includes('hull') || name.includes('h&m') || name.includes('h & m')
}

/**
 * Returns all active P&I policies with their end dates (for multi-policy picker).
 */
export function getActivePIPolicies(policies: VesselDynamicPolicy[]): { policy: VesselDynamicPolicy; endDate: string | undefined }[] {
  if (!policies || policies.length === 0) return []
  return policies
    .filter(p => p.status === 'active' && isPIPolicy(p))
    .map(p => ({ policy: p, endDate: getEndDate(p) }))
}

/**
 * Resolves the effective policy expiry date for a vessel based on its active dynamic policies.
 * If preferredPolicyId is provided, use that specific policy.
 * Otherwise: P&I first, then Hull, then undefined.
 */
export function resolveEffectivePolicyExpiry(
  policies: VesselDynamicPolicy[],
  preferredPolicyId?: string
): string | undefined {
  if (!policies || policies.length === 0) return undefined

  const activePolicies = policies.filter(p => p.status === 'active')

  // If a preferred policy is specified, use it directly
  if (preferredPolicyId) {
    const preferred = activePolicies.find(p => p.id === preferredPolicyId)
    if (preferred) {
      const d = getEndDate(preferred)
      if (d) return d
    }
  }

  // 1. Priority 1: P&I Policy (try all P&I policies, not just first)
  const piPolicies = activePolicies.filter(isPIPolicy)
  for (const piPolicy of piPolicies) {
    const d = getEndDate(piPolicy)
    if (d) return d
  }

  // 2. Priority 2: Hull & Machinery
  const hullPolicies = activePolicies.filter(isHullPolicy)
  for (const hullPolicy of hullPolicies) {
    const d = getEndDate(hullPolicy)
    if (d) return d
  }

  return undefined
}

/**
 * Resolves the effective policy inception date (Inception Date).
 */
export function resolveEffectivePolicyInception(policies: VesselDynamicPolicy[]): string | undefined {
  if (!policies || policies.length === 0) return undefined

  const activePolicies = policies.filter(p => p.status === 'active')

  const piPolicies = activePolicies.filter(isPIPolicy)
  for (const piPolicy of piPolicies) {
    const val = piPolicy.values?.find(v =>
      v.characteristicName?.toLowerCase().includes('inception')
    )
    if (val?.valueDate) return val.valueDate
  }

  const hullPolicies = activePolicies.filter(isHullPolicy)
  for (const hullPolicy of hullPolicies) {
    const val = hullPolicy.values?.find(v =>
      v.characteristicName?.toLowerCase().includes('inception')
    )
    if (val?.valueDate) return val.valueDate
  }

  return undefined
}
