import { PISectionTexts } from '../../../shared/types'

export const DEFAULT_SECTION_ORDER: string[] = [
    'insured', 'vessel', 'agreedValue', 'liability', 'period', 'conditions', 'hullConditions',
    'trading', 'warranties', 'deductibles', 'exclusions',
    'sanctions', 'subjectivities', 'ncb', 'upcc', 'premium', 'information'
]

// Type-specific default section orders
export const PI_SECTION_ORDER: string[] = [
    'insured', 'vessel', 'liability', 'period', 'conditions',
    'trading', 'warranties', 'deductibles', 'exclusions',
    'sanctions', 'subjectivities', 'ncb', 'upcc', 'premium', 'information'
]

export const HULL_SECTION_ORDER: string[] = [
    'insured', 'vessel', 'interest', 'agreedValue', 'period', 'hullConditions',
    'trading', 'warranties',
    'sanctions', 'subjectivities', 'ncb', 'upcc', 'premium', 'information'
]

export const WAR_SECTION_ORDER: string[] = [
    'insured', 'vessel', 'interest', 'sumInsured', 'period', 'warConditions',
    'warTrading', 'warranties',
    'ncb', 'upcc', 'premium', 'information'
]

export const CARGO_SECTION_ORDER: string[] = [
    'insured', 'vessel', 'insuredValue', 'voyage', 'subjectMatter',
    'cargoConditions', 'cargoSpecial', 'cargoLaw',
    'premium', 'subjectivities', 'information'
]

export function getDefaultSectionOrder(typeCode?: string): string[] {
    if (typeCode === 'H') return [...HULL_SECTION_ORDER]
    if (typeCode === 'P') return [...PI_SECTION_ORDER]
    if (typeCode === 'W') return [...WAR_SECTION_ORDER]
    if (typeCode === 'C') return [...CARGO_SECTION_ORDER]
    return [...DEFAULT_SECTION_ORDER]
}

export const SECTION_LABELS: Record<string, string> = {
    insured: 'Insured',
    vessel: 'Insured Vessel',
    liability: 'Limit of Liability',
    period: 'Period',
    conditions: 'Conditions (P&I)',
    interest: 'Interest',
    agreedValue: 'Agreed Insured Value',
    hullConditions: 'Conditions (Hull)',
    sumInsured: 'Sum Insured',
    warConditions: 'Conditions (War)',
    warTrading: 'Trading Warranty (War)',
    trading: 'Trading Warranty',
    warranties: 'Warranties',
    deductibles: 'Deductibles',
    exclusions: 'Exclusions',
    sanctions: 'Sanctions Clause',
    subjectivities: 'Subjectivities',
    premium: 'Premium',
    ncb: 'No Claims Bonus (NCB)',
    upcc: 'Upfront Continuity (UPCC)',
    information: 'Information',
    insuredValue: 'Insured Value',
    voyage: 'Voyage / Period',
    subjectMatter: 'Subject Matter Insured',
    cargoConditions: 'Conditions (Cargo)',
    cargoSpecial: 'Special Conditions (Cargo)',
    cargoLaw: 'Law and Jurisdiction (Cargo)'
}

export const DEFAULT_SECTION_TEXTS: PISectionTexts = {
    docHeader: '<p style="text-align: center"><strong>Al Bahriah Insurance &amp; Reinsurance SAL</strong></p>',
    docHeaderSpacing: 1,
    docFooter: '<p style="text-align: center">Al Bahriah Insurance &amp; Reinsurance SAL — Confidential</p>',
    docFooterSpacing: 1,
    insuredFooter: 'For their respective rights and interests and/or respectively for accounts of whom it may concern.',
    limitOfLiabilityDefaultText: 'The limit of liability of the Insurer under this Policy shall not exceed {currency} {amount} any one vessel any one accident or occurrence and in the aggregate during the policy period, except where otherwise specifically provided.',
    conditionsIntro: 'Al-Bahriah Protection & Indemnity Wording 01.01.2025 covering the following Risks Insured:',
    tradingIntro: 'Subject to Paragraph 2 below, any trade of whatsoever nature with the following countries is excluded.',
    tradingConditionA: 'Trade with the countries set out in paragraph 1 above is however permitted subject to and provided always that the following express conditions are fully complied with in every respect.',
    tradingConditionB: 'No cargoes to be carried by the vessel are sanctioned cargoes, the insured to provide all such documentary evidence as we may reasonably require to evidence the same including but not limited to Mates\' receipts, Bills of Lading etc',
    tradingConditionC: 'No individual or entity listed by any of the US, UK or EU sanctions regimes in respect of the country in question is involved in any way with the vessel, intended trade or cargoes to be carried.',
    tradingConditionD: 'The Insured is to provide a Compliance Screening Questionnaire to us not less than 3 working days in advance of the vessel\'s entry into the territorial waters of the sanctioned country.',
    tradingConditionE: 'The Insured to provide such further information as we may reasonably require about the intended trade in or with the sanctioned country.',
    tradingConditionF: 'The Insurer may decide in our sole and absolute discretion whether or not the Insurer is prepared to offer cover for the trade with the sanctioned country and, if so, on what terms and conditions.',
    tradingConditionG: 'Cover under this Paragraph 2 to be expressly subject, in any event, to the Sanction Limitation and Exclusion clause contained elsewhere in the Policy, which shall remain paramount.',
    tradingIsrael: 'Warranted no Israeli trading, involvement, cargo, counterparts whatsoever. A breach of this warranty will automatically void the cover, and discharge Insurer\'s from any liability howsoever arising as from inception of the policy.',
    ddqCountriesIntro: 'Due Diligence Questionnaire required for trading with the following countries:',
    warrantiesBreach: `In the event of any breach of the above warranties the Insurer shall be discharged from all liability from the date of the breach whether or not the breach is material to or in any way connected with the risk or any loss or claim and whether or not the breach is remedied before loss but without prejudice to any liability incurred by the Insurer before that date.

The Insurer may in its sole discretion, but shall not be obliged to:

Cancel cover provided under this Policy by notice in writing to the Insured. Such cancellation shall take effect from the date of such notice, or

Continue the Policy on such terms and conditions as it may determine.`,
    warrantiesNote: 'NOTE: The Insured\'s attention is drawn to the provisions of the {quotation_type} Terms and Conditions, which also include Warranties.',
    deductiblesAggregate: 'When one incident gives rise to a claim of a different nature, the aggregate of all claims shall be subject to the highest deductible applicable to anyone such claim.',
    subjectivitiesIntro: 'The following documents to be provided {subjectivity_days}:',
    subjectivitiesNote: 'NOTE: Failure to supply satisfactory information on any subjectivity may result in this quote being withdrawn and/or cover being cancelled and/or claims being excluded.',
    ncbDefaultText: 'Subject to {ncb_amount}, which is repayable to the insurer in case of claim.',
    upccDefaultText: '',
    continuationPiClubText: '',
    nonRefundableFirstText: 'The first instalment is deemed to be non-refundable.',
    nonRefundablePercentText: '{percent}% of premium is non-refundable.',
    premiumPaymentIntro: 'Premium shall be payable in {instalments} Instalments on the following dates, at Noon Lebanon LST, time being of the essence:',
    premiumPaymentIntroSingle: 'Premium shall be payable in one single Instalment {timing}, at Noon Lebanon LST, time being of the essence.',
    premiumCondition: 'Compliance with this clause shall be a condition precedent to coverage and/or the Insurer\'s liability under this policy. Any failure to comply shall entitle the Insurer to reject claims whether arising before or after the breach and demand payment of the full premium including all unpaid instalments.',
    premiumEarned: 'Premium deemed earned in full on inception of risk and shall be payable in full notwithstanding any breach by the Insured or any warranty or other provision of the Policy which discharges the Insurer from liability.',
    outstandingPremiumDefaultText: 'All outstanding premium to be settled prior inception',
    fullPremiumLossDefaultText: 'Full annual premium payable in case of loss.',
    informationNote: 'Note: Failure to supply information or provide satisfactory information on any subjectivity (above) may result in this quote being withdrawn and / or cover being cancelled at the sole discretion of Underwriters.',
    importantNotice: 'IMPORTANT NOTICE\n\nAttention is drawn to Clause 4 of the Al-Bahriah P&I Terms and Conditions applicable to this Policy which contains terms contracting out of certain provisions of the English Insurance Act 2015 as respects the fair presentation of the risk, the effect of warranties and other terms, the making of fraudulent claims, the duty of good faith and damages for late payment of claims.'
}
