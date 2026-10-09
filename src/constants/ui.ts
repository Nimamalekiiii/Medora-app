import { StyleSheet } from 'react-native';

import { appColor } from './adaptive-color';

/**
 * Shared look for Medora screens: the page frame, header, cards, empty
 * states, bottom-sheet forms and buttons. Screens import `ui` for these and
 * keep only their own layout in a local StyleSheet, so every page stays
 * consistent and a change here reaches all of them.
 */

/** Solid brand colours that stay the same in light and dark mode. */
export const brand = {
  primary: '#2A78D6',
  onPrimary: '#FFFFFF',
  progress: '#3B8CE8',
} as const;

export const ui = StyleSheet.create({
  // Page frame
  container: { flex: 1, backgroundColor: appColor('#F7FBFE', 'background') },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 16 },
  grow: { flex: 1 },
  centered: { textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },

  // Screen header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: appColor('#7F98A7', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: appColor('#17324D', 'text'), fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  subtitle: { color: appColor('#718594', 'text'), fontSize: 14, lineHeight: 21, marginTop: -10 },

  // Text and status
  loading: { alignItems: 'center', gap: 12, paddingVertical: 42 },
  muted: { color: appColor('#718594', 'text'), fontSize: 14 },
  cardDescription: { color: appColor('#738795', 'text'), fontSize: 12, lineHeight: 17, marginTop: 3 },
  arrow: { color: appColor('#9AADB8', 'text'), fontSize: 24, fontWeight: '300' },

  // Empty state
  emptyCard: { alignItems: 'center', gap: 8, padding: 24, borderRadius: 20, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E6EDF1', 'border') },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: appColor('#EFF7FA', 'background'), alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { color: appColor('#17324D', 'text'), fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyButton: { marginTop: 8, borderRadius: 12, backgroundColor: brand.primary, paddingHorizontal: 16, paddingVertical: 11 },
  emptyButtonText: { color: brand.onPrimary, fontSize: 13, fontWeight: '800' },

  // Bottom-sheet form
  modalKeyboard: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: 'rgba(14, 31, 43, 0.42)' },
  modalCard: { padding: 18, borderRadius: 22, backgroundColor: appColor('#F9FCFD', 'background'), gap: 9 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  modalIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E8F5FA', 'background') },
  modalTitle: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800' },
  fieldLabel: { color: appColor('#77909F', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 4 },
  textInput: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#DFE8EC', 'border'), color: appColor('#17324D', 'text'), fontSize: 16 },
  formError: { color: appColor('#A34338', 'text'), fontSize: 12, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 8 },

  // Buttons
  secondaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: appColor('#EFF4F6', 'background'), alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: appColor('#3E778F', 'text'), fontSize: 13, fontWeight: '800' },
  primaryButton: { minHeight: 44, minWidth: 118, paddingHorizontal: 15, borderRadius: 12, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: brand.onPrimary, fontSize: 13, fontWeight: '800' },
});
