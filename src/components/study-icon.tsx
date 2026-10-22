import { appColor } from '@/constants/adaptive-color';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

export type StudyIconName =
  | 'appearance'
  | 'back'
  | 'bell'
  | 'book'
  | 'brain'
  | 'calendar'
  | 'camera'
  | 'cards'
  | 'chart'
  | 'check'
  | 'chevron'
  | 'chevronDown'
  | 'chevronLeft'
  | 'clock'
  | 'cloud'
  | 'download'
  | 'flame'
  | 'focus'
  | 'globe'
  | 'graduation'
  | 'help'
  | 'info'
  | 'key'
  | 'layers'
  | 'location'
  | 'lock'
  | 'mail'
  | 'more'
  | 'note'
  | 'pencil'
  | 'person'
  | 'play'
  | 'plus'
  | 'quiz'
  | 'review'
  | 'search'
  | 'settings'
  | 'shield'
  | 'signout'
  | 'sliders'
  | 'sparkles'
  | 'swap'
  | 'target'
  | 'timer'
  | 'trash'
  | 'trend'
  | 'undo'
  | 'upload'
  | 'x'
  | 'heart'
  | 'pills'
  | 'lungs'
  | 'microbe'
  | 'figure'
  | 'drop'
  | 'eye'
  | 'flask'
  | 'stethoscope'
  | 'trophy'
  | 'shieldLock'
  | 'heartPulse'
  | 'database'
  | 'warning'
  | 'checkShield'
  | 'phone';

const SYMBOLS: Record<StudyIconName, NonNullable<SymbolViewProps['name']>> = {
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  book: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  brain: { ios: 'brain.head.profile', android: 'psychology', web: 'psychology' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  chart: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  cards: { ios: 'rectangle.on.rectangle', android: 'style', web: 'style' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  focus: { ios: 'timer', android: 'timer', web: 'timer' },
  layers: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  quiz: { ios: 'checkmark.circle', android: 'quiz', web: 'quiz' },
  review: { ios: 'arrow.clockwise', android: 'autorenew', web: 'autorenew' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  target: { ios: 'scope', android: 'track_changes', web: 'track_changes' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
  x: { ios: 'xmark', android: 'close', web: 'close' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  pencil: { ios: 'pencil', android: 'edit', web: 'edit' },
  cloud: { ios: 'icloud', android: 'cloud', web: 'cloud' },
  upload: { ios: 'square.and.arrow.up', android: 'ios_share', web: 'ios_share' },
  download: { ios: 'square.and.arrow.down', android: 'download', web: 'download' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  flame: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
  key: { ios: 'key', android: 'key', web: 'key' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  trend: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  graduation: { ios: 'graduationcap', android: 'school', web: 'school' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' },
  mail: { ios: 'envelope', android: 'mail', web: 'mail' },
  note: { ios: 'doc.text', android: 'description', web: 'description' },
  appearance: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  globe: { ios: 'globe', android: 'language', web: 'language' },
  help: { ios: 'questionmark.circle', android: 'help', web: 'help' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  lock: { ios: 'lock', android: 'lock', web: 'lock' },
  person: { ios: 'person', android: 'person', web: 'person' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  shield: { ios: 'hand.raised', android: 'privacy_tip', web: 'privacy_tip' },
  signout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  sliders: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' },
  pills: { ios: 'pills', android: 'medication', web: 'medication' },
  lungs: { ios: 'lungs', android: 'pulmonology', web: 'pulmonology' },
  microbe: { ios: 'allergens', android: 'coronavirus', web: 'coronavirus' },
  figure: { ios: 'figure.stand', android: 'accessibility_new', web: 'accessibility_new' },
  drop: { ios: 'drop', android: 'water_drop', web: 'water_drop' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  flask: { ios: 'testtube.2', android: 'science', web: 'science' },
  stethoscope: { ios: 'stethoscope', android: 'stethoscope', web: 'stethoscope' },
  trophy: { ios: 'trophy', android: 'emoji_events', web: 'emoji_events' },
  shieldLock: { ios: 'lock.shield', android: 'shield_lock', web: 'shield_lock' },
  heartPulse: { ios: 'waveform.path.ecg', android: 'monitor_heart', web: 'monitor_heart' },
  database: { ios: 'cylinder.split.1x2', android: 'database', web: 'database' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  checkShield: { ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' },
  phone: { ios: 'iphone', android: 'smartphone', web: 'smartphone' },
};

export function StudyIcon({ name, size = 22, color = appColor('#327E9D', 'text') }: { name: StudyIconName; size?: number; color?: ColorValue }) {
  return <SymbolView name={SYMBOLS[name]} size={size} tintColor={color} weight="medium" />;
}
