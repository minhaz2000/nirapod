/**
 * NEEDS CLINICIAN REVIEW — Bangla names for lab tests, mapped to the canonical keys in config/report-ranges.ts.
 * Used only by the Nirapod Lab Report MCP server (explain_lab_value) to accept Bangla test names; the app's report
 * reader is not affected. Compared after removing spaces and punctuation.
 */
export const LAB_TEST_NAMES_BN: Record<string, readonly string[]> = {
  fasting_glucose: ['খালি পেটে সুগার', 'খালি পেটে রক্তের শর্করা', 'খালি পেটে রক্তে চিনি', 'ফাস্টিং সুগার', 'ফাস্টিং ব্লাড সুগার'],
  random_glucose: ['র‍্যান্ডম সুগার', 'র্যান্ডম সুগার', 'র‍্যান্ডম ব্লাড সুগার', 'যেকোনো সময়ের সুগার'],
  after_meal_glucose: ['খাওয়ার ২ ঘণ্টা পর সুগার', 'খাবারের ২ ঘণ্টা পর সুগার', 'নাস্তার ২ ঘণ্টা পর সুগার', 'খাওয়ার পরে সুগার'],
  hba1c: ['এইচবিএওয়ানসি', 'এইচবিএ১সি', 'এইচবি এ১ সি', 'গ্লাইকেটেড হিমোগ্লোবিন'],
  hemoglobin: ['হিমোগ্লোবিন'],
  total_cholesterol: ['কোলেস্টেরল', 'টোটাল কোলেস্টেরল', 'মোট কোলেস্টেরল'],
  ldl: ['এলডিএল', 'এলডিএল কোলেস্টেরল'],
  hdl: ['এইচডিএল', 'এইচডিএল কোলেস্টেরল'],
  triglycerides: ['ট্রাইগ্লিসারাইড', 'ট্রাইগ্লিসারাইডস'],
  creatinine: ['ক্রিয়েটিনিন', 'সিরাম ক্রিয়েটিনিন', 'ক্রিয়াটিনিন'],
  alt: ['এসজিপিটি', 'এএলটি'],
  ast: ['এসজিওটি', 'এএসটি'],
  tsh: ['টিএসএইচ'],
  uric_acid: ['ইউরিক অ্যাসিড', 'ইউরিক এসিড'],
  potassium: ['পটাশিয়াম'],
  sodium: ['সোডিয়াম'],
  platelets: ['প্লাটিলেট', 'প্লেটলেট', 'অণুচক্রিকা'],
  wbc: ['ডব্লিউবিসি', 'শ্বেত রক্তকণিকা'],
};
