// Thai phonetic mapping for numbers
export const thaiNumbers: Record<string, string> = {
  '0': 'ศูนย์',
  '1': 'หนึ่ง',
  '2': 'สอง',
  '3': 'สาม',
  '4': 'สี่',
  '5': 'ห้า',
  '6': 'หก',
  '7': 'เจ็ด',
  '8': 'แปด',
  '9': 'เก้า',
};

// Thai consonant phonetic names (split format: กอ|ไก่)
export const thaiConsonants: Record<string, string[]> = {
  'ก': ['กอ', 'ไก่'],
  'ข': ['ขอ', 'ไข่'],
  'ฃ': ['ฃอ', 'ขวด'],
  'ค': ['คอ', 'ควาย'],
  'ฅ': ['ฅอ', 'คน'],
  'ฆ': ['ฆอ', 'ระฆัง'],
  'ง': ['งอ', 'งู'],
  'จ': ['จอ', 'จาน'],
  'ฉ': ['ฉอ', 'ฉิ่ง'],
  'ช': ['ชอ', 'ช้าง'],
  'ซ': ['ซอ', 'โซ่'],
  'ฌ': ['ฌอ', 'เฌอ'],
  'ญ': ['ยอ', 'หญิง'],
  'ฎ': ['ดอ', 'ชฎา'],
  'ฏ': ['ตอ', 'ปฏัก'],
  'ฐ': ['ถอ', 'ฐาน'],
  'ฑ': ['ทอ', 'มณโฑ'],
  'ฒ': ['ทอ', 'ผู้เฒ่า'],
  'ณ': ['นอ', 'เนน'],
  'ด': ['ดอ', 'เด็ก'],
  'ต': ['ตอ', 'เต่า'],
  'ถ': ['ถอ', 'ถุง'],
  'ท': ['ทอ', 'ทหาร'],
  'ธ': ['ทอ', 'ธง'],
  'น': ['นอ', 'หนู'],
  'บ': ['บอ', 'ใบไม้'],
  'ป': ['ปอ', 'ปลา'],
  'ผ': ['ผอ', 'ผึ้ง'],
  'ฝ': ['ฝอ', 'ฝา'],
  'พ': ['พอ', 'พาน'],
  'ฟ': ['ฟอ', 'ฟัน'],
  'ภ': ['พอ', 'สำเภา'],
  'ม': ['มอ', 'ม้า'],
  'ย': ['ยอ', 'ยักษ์'],
  'ร': ['รอ', 'เรือ'],
  'ล': ['ลอ', 'ลิง'],
  'ว': ['วอ', 'แหวน'],
  'ศ': ['สอ', 'ศาลา'],
  'ษ': ['สอ', 'ฤๅษี'],
  'ส': ['สอ', 'เสือ'],
  'ห': ['หอ', 'หีบ'],
  'ฬ': ['ลอ', 'จุฬา'],
  'อ': ['ออ', 'อ่าง'],
  'ฮ': ['ฮอ', 'นกฮูก'],
};

/**
 * Convert license plate or similar strings to Thai phonetic reading
 * Example: 6กณ2406 -> |หก|กอ|ไก่|นอ|เนน|สอง|สี่|ศูนย์|หก
 */
export const toThaiPhonetic = (text: string): string => {
  const parts: string[] = [];
  for (const char of text) {
    if (thaiNumbers[char]) {
      parts.push(thaiNumbers[char]);
    } else if (thaiConsonants[char]) {
      // Add both parts separately: กอ|ไก่
      parts.push(...thaiConsonants[char]);
    } else if (/[A-Za-z]/.test(char)) {
      // English letters - spell them out
      parts.push(char.toUpperCase());
    } else if (char.trim()) {
      // Keep other non-space characters
      parts.push(char);
    }
  }
  // Join with | separators: |หก|กอ|ไก่|นอ|เนน|สอง|สี่|ศูนย์|หก
  return parts.length > 0 ? `|${parts.join('|')}` : '';
};

/**
 * Check if a field name should use phonetic conversion
 */
export const shouldUsePhonetic = (fieldName: string): boolean => {
  const phoneticFields = [
    'licenseplate',
    'license_plate',
    'ทะเบียน',
    'plate',
    'registration',
  ];
  return phoneticFields.some(f => fieldName.toLowerCase().includes(f.toLowerCase()));
};
