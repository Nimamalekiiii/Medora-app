import { Children, forwardRef } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import type { ReactNode } from 'react';
import { useAppSettings } from '../services/app-settings-context';
import { tr } from '../services/localization';

function localizeChildren(children: ReactNode, language: 'en' | 'no') {
  return Children.map(children, (child) => typeof child === 'string' ? tr(child, language) : child);
}

export const LocalizedText = forwardRef<NativeText, TextProps>(function LocalizedText({ children, ...props }, ref) {
  const { preferences } = useAppSettings();
  return <NativeText {...props} ref={ref}>{localizeChildren(children, preferences.language)}</NativeText>;
});
