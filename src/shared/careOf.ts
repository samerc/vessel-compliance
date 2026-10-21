// "c/o {broker}" under the insured of quotations, policies and Debit Advices.
// `coName` holds the quotation's customer, broker OR direct client (it is the Customer column of
// the quotation list), so only a broker business prints it.

/**
 * Name printed after "c/o", or null for no c/o line. A direct client never has one; without a
 * customer type (older quotations) a typed c/o name, else an insured with a Broker role, counts.
 */
export function careOfName(
  q: { coName?: string | null; customerType?: string | null },
  brokerAssured?: string | null
): string | null {
  if (q.customerType === 'direct') return null
  return (q.coName || '').trim() || (brokerAssured || '').trim() || null
}
