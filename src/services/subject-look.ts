/**
 * How a subject is shown: an icon picked from its name and a colour picked
 * from its place in the list. Nothing is stored, so renaming a subject or
 * adding a new one just works.
 */

export type SubjectIconName = 'brain' | 'pills' | 'heart' | 'lungs' | 'microbe' | 'figure' | 'drop' | 'eye' | 'flask' | 'stethoscope' | 'layers';

const RULES: [RegExp, SubjectIconName][] = [
  [/nevro|neuro|brain|hjerne|psyk|psych/i, 'brain'],
  [/farma|pharma|drug|legemid/i, 'pills'],
  [/cardio|kardio|heart|hjerte|sirkulasjon|circul/i, 'heart'],
  [/lung|pulmo|respir/i, 'lungs'],
  [/micro|mikro|infe[ck]|virus|bakter|bacter|immun/i, 'microbe'],
  [/anatom|ortop|orthop|muskel|muscul|skjelett|skelet/i, 'figure'],
  [/hemat|haemat|blod|blood|nefro|nephro|renal|nyre|urolog/i, 'drop'],
  [/øye|oftal|ophthal|\beye/i, 'eye'],
  [/patolog|patholog|biokjemi|biochem|histolog|genet|kjemi|chemi/i, 'flask'],
  [/fysiolog|physiolog|medisin|medicine|klinisk|clinical|pediatri|paediatri|gyn|kirurg|surg/i, 'stethoscope'],
];

export function subjectIcon(name: string): SubjectIconName {
  for (const [pattern, icon] of RULES) {
    if (pattern.test(name)) return icon;
  }
  return 'layers';
}

/** One of the chart colours, repeating after the last one. */
export function subjectTint(index: number, series: string[]): string {
  if (series.length === 0) return '#2A78D6';
  return series[((index % series.length) + series.length) % series.length];
}

/** The same colour at low strength, for the chip behind the icon. */
export function softTint(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : hex;
}
