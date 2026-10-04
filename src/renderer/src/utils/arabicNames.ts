// Arabic -> English spelling of names from SIC letters. Order: spellings learned from saved imports
// (sic:getNameSpellings), then the common names below (Lebanese spelling), then letter rules.
// The result is a suggestion the user corrects; corrections are learned on save.

const ARABIC_INDIC = /[\u0660-\u0669]/g
const PERSIAN_DIGITS = /[\u06f0-\u06f9]/g

export function toWesternDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x6f0))
}

export const hasArabic = (s: string): boolean => /[\u0600-\u06ff]/.test(s)

/** Drops tatweel, harakat and stray punctuation; one space between words */
export function cleanArabic(s: string): string {
  return s
    .replace(/\u0640|[\u064b-\u065f]|\u0670/g, '')
    .replace(/["“”'«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Key used to look a word up: alef/yeh/teh-marbuta variants folded */
export function arabicKey(s: string): string {
  return cleanArabic(s).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
}

// Words that belong to the next word: "عبد الرحيم" is one name, "أبو علي" too
const JOINS_NEXT = new Set(['عبد', 'ابو', 'أبو', 'بو', 'ابن', 'بن', 'ام', 'أم'])

/** Name words, with compounds (عبد X, أبو X, ... الله) kept together */
export function arabicTokens(name: string): string[] {
  const words = cleanArabic(name).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (JOINS_NEXT.has(w) && i + 1 < words.length) {
      out.push(`${w} ${words[++i]}`)
    } else if ((w === 'الله' || w === 'الدين' || w === 'العابدين') && out.length) {
      out[out.length - 1] += ` ${w}`
    } else {
      out.push(w)
    }
  }
  return out
}

// Common names, keyed by arabicKey()
const COMMON: Record<string, string> = Object.fromEntries(
  Object.entries({
    محمد: 'Mohamad',
    احمد: 'Ahmad',
    محمود: 'Mahmoud',
    حسن: 'Hassan',
    حسين: 'Hussein',
    علي: 'Ali',
    عباس: 'Abbas',
    ابراهيم: 'Ibrahim',
    يوسف: 'Youssef',
    خليل: 'Khalil',
    سمير: 'Samir',
    رياض: 'Riad',
    توفيق: 'Toufic',
    رجا: 'Raja',
    سلامه: 'Salameh',
    حنا: 'Hanna',
    نقولا: 'Nicolas',
    اندريه: 'Andre',
    بشير: 'Bachir',
    منصور: 'Mansour',
    ماريان: 'Marianne',
    حميد: 'Hamid',
    علاء: 'Alaa',
    فادي: 'Fadi',
    عزيز: 'Aziz',
    جوليا: 'Julia',
    مارك: 'Marc',
    جميله: 'Jamileh',
    مخايل: 'Mikhael',
    ميخائيل: 'Mikhael',
    جورج: 'Georges',
    الياس: 'Elias',
    ايلي: 'Elie',
    ميشال: 'Michel',
    جوزيف: 'Joseph',
    طوني: 'Tony',
    شربل: 'Charbel',
    بطرس: 'Boutros',
    جرجس: 'Gerges',
    انطوان: 'Antoine',
    نبيل: 'Nabil',
    نادر: 'Nader',
    نادين: 'Nadine',
    ريما: 'Rima',
    رنا: 'Rana',
    هبه: 'Hiba',
    زينب: 'Zeinab',
    فاطمه: 'Fatima',
    مريم: 'Mariam',
    خديجه: 'Khadija',
    عائشه: 'Aicha',
    سعاد: 'Souad',
    ليلي: 'Layla',
    هدي: 'Houda',
    نور: 'Nour',
    ساره: 'Sara',
    رولا: 'Rola',
    مني: 'Mona',
    سهام: 'Siham',
    وفاء: 'Wafaa',
    سلوي: 'Salwa',
    نجاه: 'Najat',
    سميره: 'Samira',
    كمال: 'Kamal',
    جمال: 'Jamal',
    عادل: 'Adel',
    سامي: 'Sami',
    خالد: 'Khaled',
    وليد: 'Walid',
    زياد: 'Ziad',
    رامي: 'Rami',
    هاني: 'Hani',
    باسم: 'Bassem',
    عماد: 'Imad',
    مازن: 'Mazen',
    ماهر: 'Maher',
    وائل: 'Wael',
    عمر: 'Omar',
    عثمان: 'Osman',
    بلال: 'Bilal',
    حمزه: 'Hamza',
    مصطفي: 'Moustafa',
    جعفر: 'Jaafar',
    قاسم: 'Kassem',
    موسي: 'Moussa',
    عيسي: 'Issa',
    داود: 'Daoud',
    سليمان: 'Sleiman',
    سليم: 'Salim',
    رشيد: 'Rachid',
    نعيم: 'Naim',
    كريم: 'Karim',
    طارق: 'Tarek',
    فؤاد: 'Fouad',
    جهاد: 'Jihad',
    نزار: 'Nizar',
    غسان: 'Ghassan',
    هشام: 'Hicham',
    شادي: 'Chadi',
    ربيع: 'Rabih',
    ايمن: 'Ayman',
    حسام: 'Houssam',
    عصام: 'Issam',
    هيثم: 'Haytham',
    مروان: 'Marwan',
    نديم: 'Nadim',
    جواد: 'Jawad',
    رضا: 'Reda',
    مهدي: 'Mahdi',
    صادق: 'Sadek',
    نصر: 'Nasr',
    ناصر: 'Nasser',
    منير: 'Mounir',
    نجيب: 'Najib',
    ادوار: 'Edouard',
    فريد: 'Farid',
    شوقي: 'Chawki',
    صالح: 'Saleh',
    محسن: 'Mohsen',
    حيدر: 'Haidar',
    اسماعيل: 'Ismail',
    حبيب: 'Habib',
    جان: 'Jean',
    بيار: 'Pierre',
    شارل: 'Charles',
    فرنسوا: 'Francois',
    ريمون: 'Raymond',
    كارلوس: 'Carlos',
    سركيس: 'Sarkis',
    يعقوب: 'Yaacoub',
    لطفي: 'Lotfi',
    رفيق: 'Rafic',
    شفيق: 'Chafic',
    حسيب: 'Hassib',
    اديب: 'Adib',
    وديع: 'Wadih',
    سعيد: 'Said',
    سعد: 'Saad',
    فيصل: 'Faysal',
    عدنان: 'Adnan',
    عمار: 'Ammar',
    ياسر: 'Yasser',
    ياسين: 'Yassine',
    انور: 'Anwar',
    منذر: 'Monzer',
    نضال: 'Nidal',
    جلال: 'Jalal',
    بسام: 'Bassam',
    هادي: 'Hadi',
    مالك: 'Malek',
    فرح: 'Farah',
    لينا: 'Lina',
    دانا: 'Dana',
    ياسمين: 'Yasmine',
    ميرنا: 'Mirna',
    كارول: 'Carole',
    ماري: 'Marie',
    جانيت: 'Janet',
    غاده: 'Ghada',
    رانيا: 'Rania',
    نسرين: 'Nisrine',
    لمي: 'Lama',
    منال: 'Manal',
    امل: 'Amal',
    رشا: 'Racha',
    سمر: 'Samar',
    سناء: 'Sanaa',
    هناء: 'Hanaa',
    ابتسام: 'Ibtissam',
    نهي: 'Noha',
    دعاء: 'Doaa',
    اسراء: 'Israa',
    الاء: 'Alaa',
    شما: 'Chamma',
    سماره: 'Samara',
    عبدالله: 'Abdallah',
    'عبد الله': 'Abdallah',
    نصرالله: 'Nasrallah',
    'نصر الله': 'Nasrallah',
    'فضل الله': 'Fadlallah',
    فضلالله: 'Fadlallah',
    'جاد الله': 'Jadallah',
    'عطا الله': 'Atallah',
    'خير الله': 'Khairallah',
    'سعد الله': 'Saadallah',
    نعمه: 'Nehme',
    'نعمة الله': 'Nehmatallah',
    'نعمت الله': 'Nematollah',
    نعمتالله: 'Nematollah',
    'روح الله': 'Rouhollah',
    'عزيز الله': 'Azizollah',
    'يد الله': 'Yadollah',
    'سيف الدين': 'Seifeddine',
    'نور الدين': 'Noureddine',
    'علاء الدين': 'Alaeddine',
    'عز الدين': 'Ezzeddine',
    'بدر الدين': 'Badreddine',
    'شمس الدين': 'Chamseddine',
    'زين الدين': 'Zeineddine',
    مقلد: 'Mokalled',
    مشنتف: 'Mchantaf',
    حويك: 'Howayek',
    خواجه: 'Khawaja',
    قزي: 'Kazzi',
    بربر: 'Barbar',
    سكر: 'Sukkar',
    حداد: 'Haddad',
    خوري: 'Khoury',
    حاج: 'Hajj',
    حمود: 'Hammoud',
    حماده: 'Hamadeh',
    زعيتر: 'Zeaiter',
    جابر: 'Jaber',
    شري: 'Cherri',
    شمص: 'Chamas',
    شمس: 'Chams',
    ضاهر: 'Daher',
    عون: 'Aoun',
    فرنجيه: 'Frangieh',
    جعجع: 'Geagea',
    الجميل: 'Gemayel',
    جميل: 'Jamil',
    حريري: 'Hariri',
    ميقاتي: 'Mikati',
    سلام: 'Salam',
    كرامي: 'Karami',
    بري: 'Berri',
    جنبلاط: 'Joumblatt',
    ارسلان: 'Arslan',
    ابي: 'Abi',
    بو: 'Bou',
    ابو: 'Abou',
    صعب: 'Saab',
    غانم: 'Ghanem',
    عيد: 'Eid',
    نصار: 'Nassar',
    عيسى: 'Issa',
    ضو: 'Daou',
    رزق: 'Rizk',
    عقل: 'Akl',
    سعاده: 'Saadeh',
    سرور: 'Srour',
    رعد: 'Raad',
    ناديا: 'Nadia',
    صفا: 'Safa',
    مرعي: 'Merhi',
    مهنا: 'Mhanna',
    طه: 'Taha',
    ياغي: 'Yaghi',
    هاشم: 'Hachem',
    موسوي: 'Moussawi',
    حسيني: 'Husseini',
    امين: 'Amine',
    فخري: 'Fakhri',
    فخر: 'Fakhr',
    لبنان: 'Lebanon',
    شركه: 'Company',
    للصيرفه: 'for Exchange',
    للتجاره: 'Trading',
    'ش.م.ل': 'SAL',
    'ش.م.م': 'SARL',
    هولدنغ: 'Holding'
  }).map(([k, v]) => [arabicKey(k), v])
)

// Letter rules for words not in any list (consonant skeleton + a guessed "a" between consonants)
const LETTERS: Record<string, string> = {
  ا: 'a',
  أ: 'a',
  إ: 'i',
  آ: 'a',
  ء: '',
  ؤ: 'ou',
  ئ: 'e',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'z',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'ch',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'k',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'eh',
  و: 'ou',
  ي: 'i',
  ى: 'a',
  پ: 'p',
  چ: 'tch',
  گ: 'g',
  ژ: 'j',
  ک: 'k',
  ی: 'i'
}
const VOWEL_LETTERS = new Set(['ا', 'أ', 'إ', 'آ', 'ع', 'و', 'ي', 'ى', 'ة', 'ی'])

function byRules(word: string): string {
  const chars = [...word]
  let out = ''
  chars.forEach((c, i) => {
    const prev = chars[i - 1]
    const next = chars[i + 1]
    let piece = LETTERS[c] ?? (/[A-Za-z0-9]/.test(c) ? c : '')
    if (c === 'و' || c === 'ي' || c === 'ی') {
      // Consonant at the start of a word or after a long vowel; vowel otherwise
      if (i === 0 || (prev && VOWEL_LETTERS.has(prev) && next)) piece = c === 'و' ? 'w' : 'y'
    }
    if (c === 'ة' && i < chars.length - 1) piece = 't'
    out += piece
    // Short vowels are not written: guess an "a" between two consonants
    if (
      next &&
      !VOWEL_LETTERS.has(c) &&
      !VOWEL_LETTERS.has(next) &&
      LETTERS[c] &&
      LETTERS[next] &&
      c !== 'ء'
    )
      out += 'a'
  })
  return out
}

const cap = (w: string): string =>
  w.replace(/(^|[\s-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())

export type SpellingDictionary = Record<string, string>

/** English spelling for one name word (or compound) */
export function transliterateWord(word: string, learned: SpellingDictionary = {}): string {
  const w = cleanArabic(word)
  if (!w) return ''
  if (!hasArabic(w)) return w
  const key = arabicKey(w)
  const hit = learned[key] ?? COMMON[key]
  if (hit) return hit
  // Compounds: عبد X -> Abdel X, أبو X -> Abou X, X الله -> Xallah
  const parts = w.split(' ')
  if (parts.length === 2) {
    const [a, b] = parts
    if (a === 'عبد') return `Abdel ${transliterateWord(b.replace(/^ال/, ''), learned)}`
    if (['ابو', 'أبو', 'بو'].includes(a))
      return `${a === 'بو' ? 'Bou' : 'Abou'} ${transliterateWord(b, learned)}`
    if (['ابن', 'بن'].includes(a)) return `Ben ${transliterateWord(b, learned)}`
    if (b === 'الله') return cap(transliterateWord(a, learned).toLowerCase() + 'allah')
    if (b === 'الدين') return cap(transliterateWord(a, learned).toLowerCase() + 'eddine')
    return parts.map((p) => transliterateWord(p, learned)).join(' ')
  }
  // The article: الخواجة -> El Khawaja
  if (w.startsWith('ال') && w.length > 3) {
    const rest = w.slice(2)
    return `El ${learned[arabicKey(rest)] ?? COMMON[arabicKey(rest)] ?? cap(byRules(rest))}`
  }
  return cap(byRules(w))
}

/** English for a company name: the leading word "company" (شركة) is not part of the name */
export function transliterateCompany(name: string, learned: SpellingDictionary = {}): string {
  return transliterateName(cleanArabic(name).replace(/^(شركة|شركه)\s+/, ''), learned)
}

/** English spelling for a full name */
export function transliterateName(name: string, learned: SpellingDictionary = {}): string {
  return arabicTokens(name)
    .map((t) => transliterateWord(t, learned))
    .filter(Boolean)
    .join(' ')
}

/**
 * Word-by-word spellings the user settled on, to learn: only when the Arabic and English
 * have the same number of words (otherwise the pairing is a guess).
 */
export function spellingPairs(arabic: string, english: string): SpellingDictionary {
  const ar = arabicTokens(arabic)
  // "El Khawaja" is one word in Arabic
  const en = english
    .trim()
    .split(/\s+/)
    .reduce<string[]>((acc, w) => {
      if (acc.length && /^(el|al|abdel|abou|bou|ben|abi)$/i.test(acc[acc.length - 1]))
        acc[acc.length - 1] += ` ${w}`
      else acc.push(w)
      return acc
    }, [])
  const out: SpellingDictionary = {}
  if (!ar.length || ar.length !== en.length) return out
  ar.forEach((a, i) => {
    if (hasArabic(a) && en[i] && !hasArabic(en[i])) out[arabicKey(a)] = en[i]
  })
  return out
}

// Nationality words in letters ("لبناني", "لبنانية", "فرنسي") -> English
const NATIONALITIES: Record<string, string> = Object.fromEntries(
  Object.entries({
    لبناني: 'Lebanese',
    سوري: 'Syrian',
    فلسطيني: 'Palestinian',
    اردني: 'Jordanian',
    عراقي: 'Iraqi',
    ايراني: 'Iranian',
    مصري: 'Egyptian',
    سعودي: 'Saudi',
    كويتي: 'Kuwaiti',
    اماراتي: 'Emirati',
    قطري: 'Qatari',
    بحريني: 'Bahraini',
    عماني: 'Omani',
    يمني: 'Yemeni',
    ليبي: 'Libyan',
    تونسي: 'Tunisian',
    جزائري: 'Algerian',
    مغربي: 'Moroccan',
    سوداني: 'Sudanese',
    تركي: 'Turkish',
    فرنسي: 'French',
    اميركي: 'American',
    امريكي: 'American',
    كندي: 'Canadian',
    بريطاني: 'British',
    الماني: 'German',
    ايطالي: 'Italian',
    اسباني: 'Spanish',
    برتغالي: 'Portuguese',
    بلجيكي: 'Belgian',
    سويسري: 'Swiss',
    هولندي: 'Dutch',
    سويدي: 'Swedish',
    نمساوي: 'Austrian',
    يوناني: 'Greek',
    قبرصي: 'Cypriot',
    روسي: 'Russian',
    اوكراني: 'Ukrainian',
    ارمني: 'Armenian',
    استرالي: 'Australian',
    برازيلي: 'Brazilian',
    فنزويلي: 'Venezuelan',
    كولومبي: 'Colombian',
    مكسيكي: 'Mexican',
    ارجنتيني: 'Argentinian',
    نيجيري: 'Nigerian',
    غاني: 'Ghanaian',
    سنغالي: 'Senegalese',
    ايفواري: 'Ivorian',
    كونغولي: 'Congolese',
    افغاني: 'Afghan',
    باكستاني: 'Pakistani',
    هندي: 'Indian',
    صيني: 'Chinese',
    سيراليوني: 'Sierra Leonean',
    غيني: 'Guinean',
    ليبيري: 'Liberian',
    انغولي: 'Angolan',
    'جنوب افريقي': 'South African',
    بنمي: 'Panamanian'
  }).map(([k, v]) => [arabicKey(k), v])
)

/** "لبناني/فرنسي" -> "Lebanese/French"; null when a word is not a known nationality */
export function nationalityFromArabic(text: string): string | null {
  const parts = cleanArabic(text)
    .split(/[/،,]| و /)
    .map((p) => arabicKey(p).replace(/ه$/, '').trim())
    .filter(Boolean)
  if (!parts.length) return null
  const found = parts.map((p) => NATIONALITIES[p] ?? NATIONALITIES[p.replace(/^ال/, '')])
  return found.every(Boolean) ? found.join('/') : null
}
