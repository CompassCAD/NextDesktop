import en from './en.json';
import sv from './sv.json'


// English is the single source of truth: every other locale is typed
// against its shape, and any missing key falls back to English at runtime.
export const locales = { en, sv } as const;

export type LocaleCode = keyof typeof locales;
export const supportedLanguages = (Object.keys(locales) as LocaleCode[]).sort();

// Recursively builds a union of dot-notation paths from the English locale,
// e.g. "editor.test" | "name" | ...
type PathsOf<T, Prefix extends string = ''> = T extends string
  ? Prefix extends '' ? never : Prefix
  : {
    [K in keyof T & string]: PathsOf<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>;
  }[keyof T & string];

export type LocaleKey = PathsOf<typeof en>;

export const SetLanguage = (lang: string): void => {
  const selectedLang = (supportedLanguages as string[]).includes(lang) ? lang : 'en';
  localStorage.setItem('language', selectedLang);
};

export const GetLanguage = (): LocaleCode => {
  const lang = localStorage.getItem('language') || navigator.language.split('-')[0];
  return (locales as Record<string, unknown>)[lang] ? (lang as LocaleCode) : 'en';
};

function resolvePath(obj: unknown, path: string): string | undefined {
  let value: unknown = obj;
  for (const key of path.split('.')) {
    if (value && typeof value === 'object' && key in (value as object)) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return typeof value === 'string' ? value : undefined;
}

export function getLocaleKey(path: LocaleKey): string {
  const lang = GetLanguage();
  return resolvePath(locales[lang], path) ?? resolvePath(locales.en, path) ?? '';
}
