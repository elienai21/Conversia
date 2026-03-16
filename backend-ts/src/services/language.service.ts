import { franc } from "franc";

// franc returns ISO 639-3 codes, we need ISO 639-1
const ISO_639_3_TO_1: Record<string, string> = {
  por: "pt",
  eng: "en",
  spa: "es",
  fra: "fr",
  deu: "de",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  zho: "zh",
  ara: "ar",
  rus: "ru",
  hin: "hi",
  nld: "nl",
  pol: "pl",
  tur: "tr",
  vie: "vi",
  tha: "th",
  swe: "sv",
  dan: "da",
  fin: "fi",
  nor: "no",
  ces: "cs",
  ron: "ro",
  hun: "hu",
  ell: "el",
  heb: "he",
  ind: "id",
  msa: "ms",
  ukr: "uk",
  cat: "ca",
};

export function detectLanguage(text: string): string {
  const result = franc(text, { minLength: 3 });

  if (result === "und") {
    return "en"; // default
  }

  return ISO_639_3_TO_1[result] ?? "en";
}
