// 便の origin IATA から議論で使う言語を決定する。
// OpenAI TTS は multilingual。voice (onyx / nova / shimmer) は固定したまま、
// 生成されるテキストの言語のみ切り替える。

export const LANG_MAP = {
  // 日本
  HND: "ja", NRT: "ja", KIX: "ja",
  // ドイツ語圏
  FRA: "de", MUC: "de", BER: "de", VIE: "de", ZRH: "de",
  // フランス語
  CDG: "fr", ORY: "fr",
  // アラビア語
  DXB: "ar", AUH: "ar", DOH: "ar",
  // 中国語
  PEK: "zh", PVG: "zh", CAN: "zh", HKG: "zh", TPE: "zh",
  // 韓国語
  ICN: "ko", GMP: "ko",
  // トルコ語
  IST: "tr",
  // スペイン語
  MAD: "es", BCN: "es",
  // 英語圏
  JFK: "en", LHR: "en", LAX: "en", SFO: "en", ORD: "en", ATL: "en",
  DFW: "en", MEM: "en", SIN: "en", AMS: "en",
  SYD: "en", MEL: "en", AKL: "en",
};

export const LANG_META = {
  ja: { name: "日本語",       displayCode: "JA", rtl: false, native: "日本語" },
  en: { name: "English",      displayCode: "EN", rtl: false, native: "English" },
  de: { name: "Deutsch",      displayCode: "DE", rtl: false, native: "Deutsch" },
  fr: { name: "Français",     displayCode: "FR", rtl: false, native: "Français" },
  ar: { name: "Arabic",       displayCode: "AR", rtl: true,  native: "العربية" },
  zh: { name: "Mandarin",     displayCode: "ZH", rtl: false, native: "中文" },
  ko: { name: "Korean",       displayCode: "KO", rtl: false, native: "한국어" },
  tr: { name: "Turkish",      displayCode: "TR", rtl: false, native: "Türkçe" },
  es: { name: "Spanish",      displayCode: "ES", rtl: false, native: "Español" },
};

// system prompt の末尾に動的挿入する言語指定。
// prefix マーカー（> 記録照合 等）も対象言語に翻訳するよう明示する。
// 末尾の STANCE トークン (PASS / HOLD / DENY) は英語固定で残させる。
const LANG_INSTRUCTION = {
  ja: `Respond in Japanese (日本語), airport announcement tone (空港アナウンス調).
Keep the Japanese prefix markers as-is (> 記録照合 / > 過去インシデント etc.).
End with the stance token in English: PASS / HOLD / DENY.`,
  en: `Respond in English, airport announcement tone.
Translate the prefix markers into English (e.g. > RECORD MATCH, > PAST INCIDENT,
> BLACKLIST, > RISK PATTERN, > CURRENT, > BACKLOG, > DOWNSTREAM, > EFFICIENCY,
> SIMULATION, > CONNECTING PAX, > LONG-TERM, > HUMANITARIAN).
End with the stance token: PASS / HOLD / DENY.`,
  de: `Respond in German (Deutsch), airport announcement tone.
Translate the prefix markers into German (e.g. > AKTENABGLEICH, > VORFÄLLE,
> SPERRLISTE, > RISIKOMUSTER, > LAGEBEURTEILUNG, > VERZUG, > FOLGEFLÜGE,
> EFFIZIENZ, > SIMULATION, > ANSCHLÜSSE, > LANGFRISTIG, > HUMANITÄR).
End with the stance token in English: PASS / HOLD / DENY.`,
  fr: `Respond in French (Français), airport announcement tone.
Translate the prefix markers into French.
End with the stance token in English: PASS / HOLD / DENY.`,
  ar: `Respond in Modern Standard Arabic (العربية), airport announcement tone.
Translate the prefix markers into Arabic. The text will be rendered RTL.
End with the stance token in Latin letters: PASS / HOLD / DENY.`,
  zh: `Respond in Simplified Chinese (中文), airport announcement tone.
Translate the prefix markers into Chinese (e.g. > 记录核对, > 历史事件,
> 黑名单, > 风险模式, > 现状, > 滞留, > 后续航班, > 效率,
> 预测, > 接续旅客, > 长期影响, > 人道考量).
End with the stance token in English: PASS / HOLD / DENY.`,
  ko: `Respond in Korean (한국어), airport announcement tone.
Translate the prefix markers into Korean.
End with the stance token in English: PASS / HOLD / DENY.`,
  tr: `Respond in Turkish (Türkçe), airport announcement tone.
Translate the prefix markers into Turkish.
End with the stance token in English: PASS / HOLD / DENY.`,
  es: `Respond in Spanish (Español), airport announcement tone.
Translate the prefix markers into Spanish.
End with the stance token in English: PASS / HOLD / DENY.`,
};

export function detectLanguage(originCode) {
  return LANG_MAP[originCode] ?? "en";
}

export function languageInstruction(lang) {
  return LANG_INSTRUCTION[lang] ?? LANG_INSTRUCTION.en;
}

export function isRTL(lang) {
  return LANG_META[lang]?.rtl ?? false;
}

export function languageMeta(lang) {
  return LANG_META[lang] ?? LANG_META.en;
}
