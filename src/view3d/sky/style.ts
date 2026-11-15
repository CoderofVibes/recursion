import { Color } from 'three';
import { colour, outsideStyle } from '../../theme/index.ts';

/** Local optical extensions of Night Watch; candidates for the theme owner to adopt. */
export const skyStyle = {
  white: new Color(colour.measured).lerp(new Color('white'), 0.75),
  cold: new Color(outsideStyle.bodyLitCool).offsetHSL(0.03, 0.05, 0.25),
  rust: new Color(colour.bodyLit).offsetHSL(-0.07, -0.1, -0.08),
  ocean: new Color(outsideStyle.bodyLitCool).offsetHSL(0.04, 0.46, -0.17),
  land: new Color(colour.bodyLit).offsetHSL(0.12, -0.12, -0.12),
  air: new Color(outsideStyle.bodyLitCool).offsetHSL(0.06, 0.38, 0.2),
  starCount: outsideStyle.starCount * 3,
  starSize: outsideStyle.starSize,
  galaxyGain: 0.22,
} as const;
