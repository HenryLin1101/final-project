import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-TW', 'en'],
  defaultLocale: 'zh-TW',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
