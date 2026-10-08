import { Appearance, DynamicColorIOS, Platform, type ColorValue } from 'react-native';

type ColorRole = 'background' | 'text' | 'border';

const DARK_PALETTE: Record<string, string> = {
  '#FFFFFF': '#1B2932', '#ffffff': '#1B2932', '#F5FAFC': '#101A21', '#F7FBFE': '#17242C', '#F7FAFC': '#17242C',
  '#F4F8FA': '#202E37', '#F9FCFE': '#1D2B34', '#F2F8FA': '#1B2A33', '#E7F4F8': '#20343E', '#E1F3F7': '#25434D',
  '#DDF1F5': '#2B4751', '#E6EEF2': '#273640', '#E8F1F5': '#273640', '#EDF3F6': '#2B3942', '#E7F0F4': '#2B3942',
  '#E3EEF3': '#2C3C46', '#E4EDF1': '#33434C', '#D8E6EC': '#3A4C57', '#D9E8EE': '#3A4C57', '#DDECF3': '#3A4C57',
  '#17324D': '#EAF3F7', '#315267': '#D3E1E7', '#577082': '#B6C7D0', '#718493': '#A2B3BD', '#748592': '#A2B3BD',
  '#758A98': '#A8B9C2', '#7A8E9A': '#A8B9C2', '#8799A4': '#92A7B2', '#8DA2AF': '#859CA8', '#9AAAB4': '#879BA5',
  '#0F7181': '#77C7D4', '#327E9D': '#63B2C6', '#448EA8': '#71B9CC', '#83A3B1': '#7895A1', '#91A0AA': '#8EA2AE',
  '#A8DFF3': '#397287', '#C5ECFA': '#284E5D', '#E4F4F8': '#27444E', '#F7FBFD': '#1B2A33', '#F4F7F9': '#202E37',
};

function deriveDark(color: string, role: ColorRole = 'text') {
  if (role === 'background') {
    const background: Record<string, string> = {
      '#FFFFFF': '#1B2932', '#ffffff': '#1B2932', '#F5FAFC': '#101A21', '#F7FBFE': '#17242C', '#F7FAFC': '#17242C',
      '#F4F8FA': '#202E37', '#F9FCFE': '#1D2B34', '#F2F8FA': '#1B2A33', '#E7F4F8': '#20343E', '#E1F3F7': '#25434D',
      '#DDF1F5': '#2B4751', '#E6EEF2': '#273640', '#E8F1F5': '#273640', '#F7FBFD': '#1B2A33', '#F4F7F9': '#202E37',
      '#17324D': '#243B4A', '#0F7181': '#145664', '#327E9D': '#20596C', '#43A5D1': '#23627A', '#D93E4E': '#A92D3A', '#B92537': '#8F1D2B',
    };
    const exactBackground = background[color] ?? background[color.toUpperCase()];
    if (exactBackground) return exactBackground;
  }
  if (role === 'border') {
    const border: Record<string, string> = {
      '#E7F0F4': '#2B3942', '#EDF3F6': '#2B3942', '#E4EDF1': '#33434C', '#D8E6EC': '#3A4C57',
      '#D9E8EE': '#3A4C57', '#DDECF3': '#3A4C57', '#FFFFFF': '#35444D', '#ffffff': '#35444D',
    };
    const exactBorder = border[color] ?? border[color.toUpperCase()];
    if (exactBorder) return exactBorder;
  }
  if (role === 'text' && (color === '#FFFFFF' || color === '#ffffff')) return '#FFFFFF';
  if (role === 'text' && color.toUpperCase() === '#43A5D1') return '#68C5E9';
  if (role === 'text' && color.toUpperCase() === '#4AA9D8') return '#72C9F1';
  const exact = DARK_PALETTE[color] ?? DARK_PALETTE[color.toUpperCase()];
  if (exact) return exact;
  const raw = color.replace('#', '');
  if (raw.length === 8) return color; // Keep alpha overlays intact.
  if (raw.length !== 6) return '#D8E4E9';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance > 0.88) return '#1B2932';
  if (luminance > 0.68) return '#2B3B45';
  if (luminance < 0.2) return '#EAF3F7';
  if (luminance < 0.42) return '#B6C7D0';
  return '#879BA5';
}

export function appColor(light: string, role: ColorRole = 'text'): ColorValue {
  if (Platform.OS === 'ios') return DynamicColorIOS({ light, dark: deriveDark(light, role) });
  if (Appearance.getColorScheme() === 'dark') return deriveDark(light, role);
  return light;
}
