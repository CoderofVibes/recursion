/** Spacing, radii and panel construction. px. Everything sits on a 2 px grid. */
export const space = {
  unit: 2,
  /** Gap between console modules. */
  gap: 10,
  /** Gap between rows inside a module. */
  rowGap: 6,
  panelPadX: 10,
  panelPadY: 8,
  /** Console modules are fitted hardware: small radius, inset bevel, a screw head. */
  panelRadius: 3,
  tableRadius: 9,
  tablePad: 12,
  /** Compartment margin around the table. */
  roomPadX: 22,
  roomPadTop: 44,
  tableLip: 16,
} as const;

/** Panel construction shadows (CSS). */
export const surface = {
  panelInset: 'inset 0 1px 0 rgba(255,220,170,0.05), inset 0 -2px 6px rgba(0,0,0,0.6)',
  tableShadow: '0 -1px 0 rgba(255,255,255,0.04), 0 -30px 60px rgba(0,0,0,0.5)',
  /** Small lit pips (equipment status, Black Box lamp). */
  pipGlow: '0 0 6px',
} as const;
