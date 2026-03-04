declare module 'expo-localization' {
  export interface Locale {
    languageTag: string;
    languageCode: string | null;
    textDirection: 'ltr' | 'rtl' | null;
    digitGroupingSeparator: string | null;
    decimalSeparator: string | null;
    measurementSystem: string | null;
    currencyCode: string | null;
    currencySymbol: string | null;
    regionCode: string | null;
    temperatureUnit: string | null;
  }

  export function getLocales(): Locale[];
  export function getCalendars(): Array<{
    calendar: string | null;
    timeZone: string | null;
    uses24hourClock: boolean | null;
    firstWeekday: number | null;
  }>;
}
