// Blue card default texts, kept apart from PolicyExportService so the settings page can
// show them without loading the docx export code.

const BC_DEFAULT_TITLE_BBC =
  'CERTIFICATE OF INSURANCE\nPURSUANT\nTO ARTICLE 7 OF THE INTERNATIONAL CONVENTION ON CIVIL LIABILITY FOR BUNKER OIL POLLUTION DAMAGE, 2001'

const BC_DEFAULT_TITLE_WRC =
  'CERTIFICATE OF INSURANCE\nPURSUANT\nTO ARTICLE 12 OF THE NAIROBI INTERNATIONAL CONVENTION ON THE REMOVAL OF WRECKS, 2007'

const BC_DEFAULT_TITLE_MLC42 =
  'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF SHIPOWNERS\u2019 LIABILITY AS REQUIRED UNDER REGULATION 4.2, STANDARD A4.2.1 PARAGRAPH 1(b) OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'

const BC_DEFAULT_TITLE_MLC252 =
  'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF SEAFARER REPATRIATION COSTS AND LIABILITIES AS REQUIRED UNDER REGULATION 2.5.2, STANDARD A2.5.2 OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'

const BC_DEFAULT_CERTIFY_BBC =
  'THIS IS TO CERTIFY that there is in force in respect of the above-named ship a policy of insurance or other financial security satisfying the requirements of Article 7 of the International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001.'

const BC_DEFAULT_CERTIFY_WRC =
  'THIS IS TO CERTIFY that there is in force in respect of the above-named ship a policy of insurance or other financial security satisfying the requirements of Article 12 of the Nairobi International Convention on the Removal of Wrecks, 2007.'

const BC_DEFAULT_CERTIFY_MLC42 =
  'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, a policy of insurance or other financial security satisfying the requirements of Standard A4.2.1, paragraph 1(b) of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CERTIFY_MLC252 =
  'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, a policy of insurance or other financial security satisfying the requirements of Regulation 2.5.2, Standard A2.5.2 of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CANCEL_BBC =
  "Provided always that the insurer may cancel this certificate by giving three months' written notice to the above Authority, the insurance ceasing to be effective on the date of expiry of the said notice or on the date of expiry of the policy whichever is the earlier."

const BC_DEFAULT_CANCEL_WRC = BC_DEFAULT_CANCEL_BBC

const BC_DEFAULT_CANCEL_MLC42 =
  'The insurer undertakes to give at least 30 days\u2019 notice to the competent authority of the flag State of the ship of the cancellation or termination of the financial security, as required by Standard A4.2.12 of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CANCEL_MLC252 =
  'The insurer undertakes to give at least 30 days\u2019 notice to the competent authority of the flag State of the ship of the cancellation or termination of the financial security, as required by Standard A2.5.2.11 of the Maritime Labour Convention, 2006, as amended.'

/** Exported for use by PolicySettings Blue Card Texts tab */
export const BC_DEFAULTS = {
  bc_text_BBC_title: BC_DEFAULT_TITLE_BBC,
  bc_text_WRC_title: BC_DEFAULT_TITLE_WRC,
  bc_text_MLC42_title: BC_DEFAULT_TITLE_MLC42,
  bc_text_MLC252_title: BC_DEFAULT_TITLE_MLC252,
  bc_text_BBC_certify: BC_DEFAULT_CERTIFY_BBC,
  bc_text_WRC_certify: BC_DEFAULT_CERTIFY_WRC,
  bc_text_MLC42_certify: BC_DEFAULT_CERTIFY_MLC42,
  bc_text_MLC252_certify: BC_DEFAULT_CERTIFY_MLC252,
  bc_text_BBC_cancel: BC_DEFAULT_CANCEL_BBC,
  bc_text_WRC_cancel: BC_DEFAULT_CANCEL_WRC,
  bc_text_MLC42_cancel: BC_DEFAULT_CANCEL_MLC42,
  bc_text_MLC252_cancel: BC_DEFAULT_CANCEL_MLC252,
  bc_mlc_email: '',
  bc_mlc_phone: '',
  bc_mlc_website: '',
  bc_mlc_company_address: ''
} as const
