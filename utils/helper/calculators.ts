/** Deterministic, read-only crochet math. No generated code is ever evaluated. */
export const CALCULATIONS = ['yarn', 'skeins', 'convert', 'gauge', 'rows', 'shaping', 'percent', 'time'] as const;
export type Calculation = (typeof CALCULATIONS)[number];
export type CalculationRequest = { operation: Calculation; values: number[]; units: string[] };
export type CalculationResult = { ok: boolean; text: string };
export type CalculatorField = { label: string; example: string };
export const CALCULATOR_FIELDS: Record<Calculation, readonly CalculatorField[]> = {
  yarn: [{ label: 'Grams remaining', example: '35' }, { label: 'Label grams', example: '100' }, { label: 'Label length (yards)', example: '200' }],
  skeins: [{ label: 'Required length (yards)', example: '450' }, { label: 'Yards per skein', example: '200' }],
  convert: [{ label: 'Amount', example: '100' }],
  gauge: [{ label: 'Target width (cm)', example: '30' }, { label: 'Stitches in swatch', example: '18' }, { label: 'Swatch width (cm)', example: '10' }, { label: 'Repeat multiple', example: '1' }, { label: 'Edge stitches (total)', example: '0' }],
  rows: [{ label: 'Target height (cm)', example: '30' }, { label: 'Rows in swatch', example: '22' }, { label: 'Swatch height (cm)', example: '10' }],
  shaping: [{ label: 'Starting stitches', example: '40' }, { label: 'Target stitches', example: '48' }],
  percent: [{ label: 'Starting value', example: '100' }, { label: 'Percent change (negative to reduce)', example: '20' }],
  time: [{ label: 'Elapsed minutes (exclude breaks)', example: '60' }, { label: 'Completed rows', example: '10' }, { label: 'Total rows', example: '40' }],
};
export const CALCULATOR_NAMES: Record<Calculation, string> = {
  yarn: 'Yarn remaining', skeins: 'Skeins needed', convert: 'Unit conversion', gauge: 'Gauge & repeats', rows: 'Gauge rows',
  shaping: 'Increase / decrease', percent: 'Percentage change', time: 'Time estimate',
};
const lengthUnits: Record<string, number> = { cm: 0.01, m: 1, in: 0.0254, yd: 0.9144 };
const massUnits: Record<string, number> = { g: 1, oz: 28.349523125 };
export const CONVERSION_PAIRS = [['yd', 'm'], ['m', 'yd'], ['in', 'cm'], ['cm', 'in'], ['g', 'oz'], ['oz', 'g']] as const;
const num = (n: number) => Number(n.toFixed(3)).toLocaleString('en-US');
const good = (text: string): CalculationResult => ({ ok: true, text });
const bad = (text: string): CalculationResult => ({ ok: false, text });
const integer = (n: number) => Number.isInteger(n) && n > 0 && n <= 100_000;

export function calculateCrochet(input: CalculationRequest): CalculationResult {
  const v = input.values;
  if (!CALCULATIONS.includes(input.operation) || !Array.isArray(v) || v.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e9 || (n !== 0 && Math.abs(n) < 1e-6))) {
    return bad('Enter finite numbers within the calculator’s supported range.');
  }
  const [a, b, c, d = 1, e = 0] = v;
  switch (input.operation) {
    case 'yarn': {
      if (v.length !== 3 || a < 0 || !(b > 0) || !(c > 0)) return bad('I need grams remaining, label grams, and label length; label values must be above zero.');
      const unit = input.units[0] ?? 'yd';
      if (unit !== 'yd' && unit !== 'm') return bad('The label length must be in yards (yd) or meters (m).');
      return good(`Approximately ${num(a / b * c)} ${unit} remaining.\n${num(a)} g ÷ ${num(b)} g × ${num(c)} ${unit} = ${num(a / b * c)} ${unit}.\nAssumes the same yarn and the label’s length-to-weight ratio; exclude the weight of a core or container.`);
    }
    case 'skeins': {
      if (v.length !== 2 || !(a > 0) || !(b > 0)) return bad('Enter required length and length per skein, both above zero and in the same unit.');
      const unit = input.units[0] ?? 'yd';
      if (unit !== 'yd' && unit !== 'm') return bad('Use yards (yd) or meters (m).');
      return good(`${Math.ceil(a / b)} skeins.\nRound up ${num(a)} ${unit} ÷ ${num(b)} ${unit}/skein = ${num(a / b)} skeins.\nThis does not add an allowance for swatching, waste, or changes in gauge.`);
    }
    case 'convert': {
      if (v.length !== 1 || a < 0) return bad('Enter one amount of zero or more.');
      const [from, to] = input.units;
      const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
      const units = has(lengthUnits, from) && has(lengthUnits, to) ? lengthUnits : has(massUnits, from) && has(massUnits, to) ? massUnits : null;
      if (!units) return bad('Choose compatible length units (cm, m, in, yd) or mass units (g, oz).');
      return good(`${num(a)} ${from} = ${num(a * units[from] / units[to])} ${to}.`);
    }
    case 'gauge': {
      if (v.length < 3 || v.length > 5 || !(a > 0) || !integer(b) || !(c > 0) || !integer(d) || !Number.isInteger(e) || e < 0 || e > 1000) {
        return bad('Enter target width, counted swatch stitches, measured swatch width, a positive whole repeat multiple, and nonnegative whole edge stitches.');
      }
      const raw = a * b / c;
      if (raw <= e) return bad('The edge stitches exceed the gauge-based total. Check width and edge counts.');
      const count = Math.ceil((raw - e) / d) * d + e;
      return good(`${count} stitches across, including ${e} edge stitches.\n${num(a)} cm × ${b} stitches ÷ ${num(c)} cm = ${num(raw)} stitches before repeat adjustment.\nRound the inner count up to a multiple of ${d}, then add ${e} edge stitches. Estimated width: ${num(count * c / b)} cm at your measured gauge. Foundation/turning chains depend on the actual pattern.`);
    }
    case 'rows': {
      if (v.length !== 3 || !(a > 0) || !integer(b) || !(c > 0)) return bad('Enter target height, counted swatch rows, and measured swatch height, all above zero.');
      return good(`${Math.ceil(a * b / c)} rows.\n${num(a)} cm × ${b} rows ÷ ${num(c)} cm = ${num(a * b / c)} rows; round up to a whole row. Follow any pattern row-repeat rules and recheck your swatch gauge.`);
    }
    case 'shaping': {
      if (v.length !== 2 || !integer(a) || !integer(b)) return bad('Enter positive whole starting and target stitch counts (up to 100,000).');
      if (a === b) return good(`Keep ${a} stitches; no shaping is needed.`);
      const changes = Math.abs(b - a);
      const increasing = b > a;
      if (increasing ? changes > a : changes > Math.floor(a / 2)) return bad('This change needs multiple passes or another construction. The calculator supports one inc per stitch or one two-stitch decrease per group.');
      const base = Math.floor(a / changes);
      const remainder = a % changes;
      const segments: { plain: number; count: number }[] = [];
      for (let i = 0; i < changes; i++) {
        const extra = Math.floor((i + 1) * remainder / changes) - Math.floor(i * remainder / changes);
        const plain = base + extra - (increasing ? 1 : 2);
        const last = segments[segments.length - 1];
        if (last?.plain === plain) last.count++;
        else segments.push({ plain, count: 1 });
      }
      const action = increasing ? 'inc' : 'dec';
      // Avoid an enormous instruction dump for awkward large ratios.
      const instruction = segments.length <= 24
        ? segments.map((s) => `(${s.plain ? `${s.plain} sc, ` : ''}${action}) × ${s.count}`).join('; ')
        : `${changes - remainder} groups of (${base - (increasing ? 1 : 2)} sc, ${action}) and ${remainder} groups of (${base + 1 - (increasing ? 1 : 2)} sc, ${action}), spacing the longer groups evenly`;
      return good(`${instruction}.\n${a} → ${b} stitches: ${changes} ${increasing ? 'increases' : 'decreases'}.\nFor a simple US single-crochet round: inc = 2 sc into one stitch; dec = sc2tog. Every starting stitch is consumed once. Follow the original pattern’s placement when shaping matters.`);
    }
    case 'percent': {
      if (v.length !== 2 || a < 0 || b < -100 || b > 10000) return bad('Enter a nonnegative starting value and a percent change from −100 to 10,000.');
      return good(`${num(a)} × (1 + ${num(b)} ÷ 100) = ${num(a * (1 + b / 100))}.\nRound stitch counts to the pattern’s repeat and edge rules.`);
    }
    case 'time': {
      if (v.length !== 3 || !(a > 0) || !integer(b) || !integer(c) || b > c) return bad('Enter elapsed minutes, completed whole rows, and total rows; completed rows cannot exceed total rows.');
      return good(`Approximately ${num(a / b * (c - b))} minutes remaining.\n${num(a)} minutes ÷ ${b} completed rows × ${c - b} remaining rows.\nAssumes later rows take the same time and the timer excludes breaks. Shaping, assembly, and finishing can change this estimate.`);
    }
  }
}
