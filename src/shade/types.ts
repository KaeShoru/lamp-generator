export type PatternType = 'ribsRect' | 'wave' | 'accordionTri' | 'groovesRound' | 'groovesT'

export type TwistProfile = 'linear' | 'easeInOut' | 'sine'

export type PlugShape = 'follow' | 'circle'

export type ShadeParams = {
  /** mm */
  height: number
  /** mm */
  baseDiameter: number
  /** mm */
  topDiameter: number
  /** mm */
  thickness: number

  radialSegments: number
  heightSegments: number

  /** max overhang from vertical, degrees */
  maxOverhangDeg: number


  /** whether to add a bottom plug */
  bottomPlug: boolean
  /** shape: follow bottom layer or circular */
  bottomPlugShape: PlugShape
  /** mm; diameter of circular plug (only used when shape is 'circle') */
  bottomPlugDiameter: number
  /** mm; thickness of the upper plug seal (follows lamp shape) */
  bottomPlugThickness: number
  /** mm; thickness of the bottom circle disc (only for 'circle' shape) */
  bottomPlugDiscThickness: number
  /** mm; diameter of hole in the bottom plug; 0 = no hole */
  bottomPlugHoleDiameter: number

  /** mm */
  bulgeMm: number
  /** 0..1 */
  bulgePos: number
  /** mm */
  waistMm: number
  /** 0..1 */
  waistPos: number

  /** total twist across height, degrees */
  twistDeg: number
  twistProfile: TwistProfile

  pattern: PatternType
  /** mm */
  patternAmpMm: number
  /** cycles around circumference */
  patternFreq: number
  /** cycles along height */
  patternYFreq: number
  /** enable mirrored ribs (cross-hatch grid) */
  patternMirror: boolean
  /** smooth fade pattern at top/bottom edges to prevent elephant foot */
  patternEdgeFade: boolean

  /** enable spiral veins (thick braids around the lamp) */
  veinsEnabled: boolean
  /** number of veins (2-8) */
  veinCount: number
  /** mm - how much veins protrude */
  veinAmplitudeMm: number
  /** number of full turns around the lamp */
  veinTurns: number
  /** tilt angle in degrees (-90..90), adjusts diagonal angle of braids */
  veinTiltDeg: number
  /** angular width of each vein (0.05..1.0) */
  veinWidth: number
  /** mm - depth of valleys between veins */
  veinValleyMm: number
}

