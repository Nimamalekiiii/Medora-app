import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveAppColor, theme } from '../src/constants/theme-colors.ts';

test('screens are light blue in light mode and deep navy in dark mode', () => {
  assert.deepEqual(resolveAppColor('#F7FBFE', 'background'), { light: theme.light.page, dark: theme.dark.page });
  assert.deepEqual(resolveAppColor('#FFFFFF', 'background'), { light: theme.light.card, dark: theme.dark.card });
  assert.deepEqual(resolveAppColor('#F4F8FA', 'background'), { light: theme.light.inset, dark: theme.dark.inset });
});

test('teal accents become the one app blue, and dark ink stays ink', () => {
  for (const teal of ['#327E9D', '#0F7181', '#448EA8', '#4AA9D8']) {
    assert.deepEqual(resolveAppColor(teal, 'text'), { light: theme.light.accent, dark: theme.dark.accent });
  }
  assert.deepEqual(resolveAppColor('#17324D', 'text'), { light: theme.light.ink, dark: theme.dark.ink });
  assert.equal(resolveAppColor('#29495D', 'text').light, '#29495D');
  assert.equal(resolveAppColor('#327E9D', 'background').light, theme.light.accent);
});

test('grey text keeps its colour in light mode and gets lighter in dark mode', () => {
  const muted = resolveAppColor('#718493', 'text');
  assert.equal(muted.light, '#718493');
  assert.equal(muted.dark, '#91A6C0');
});

test('red, amber and green keep their meaning in both modes', () => {
  assert.deepEqual(resolveAppColor('#A34338', 'text'), { light: '#A34338', dark: '#F2938A' });
  assert.deepEqual(resolveAppColor('#9A6530', 'text'), { light: '#9A6530', dark: '#E3AE6C' });
  assert.deepEqual(resolveAppColor('#1E7B4F', 'text'), { light: '#1E7B4F', dark: '#5FCB9E' });
  assert.equal(resolveAppColor('#D93E4E', 'background').dark, '#A92D3A');
  assert.equal(resolveAppColor('#FFF2F0', 'background').light, '#FFF2F0');
});

test('borders follow the theme and transparent colours are left alone', () => {
  assert.deepEqual(resolveAppColor('#E7F0F4', 'border'), { light: theme.light.border, dark: theme.dark.border });
  assert.deepEqual(resolveAppColor('#10283B88', 'background'), { light: '#10283B88', dark: '#10283B88' });
});
