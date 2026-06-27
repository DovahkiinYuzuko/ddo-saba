import type { LocaleStrings } from '../types';
import { en } from './locales/en';
import { ja } from './locales/ja';

export const locales: Record<'en' | 'ja', LocaleStrings> = {
  en,
  ja
};
