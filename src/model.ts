export type Fermentation = "off" | "lactate" | "alcohol";
export type Shuttle = "malate" | "glycerol";
export const DT = 1 / 120;

export const MODEL = {
  nadPool: 8, fadPool: 4, cytPool: 4, shuttleQPool: 2,
  oxygenCapacity: 4, adpCapacity: 5, piCapacity: 6,
  glucoseRate: 0.32, pdhRate: 1.15, tcaRate: 1.10, shuttleRate: 0.85,
  iCapacity: 4.9, iiCapacity: 1.8, qCapacity: 1.2, iiiCapacity: 6.1, ivCapacity: 6.0,
  succinateInput: 0.18, reverseAtpStock: 4, reverseCapacity: 1.25,
  maxGradient: 16, chargeMv: 11.4, matrixBuffer: 0.032, imsBuffer: 0.019,
  synthCapacity: 11, synthesisThresholdMv: 56, effectiveHPerAtp: 4,
  baseLeak: 0.12, uncouplingLeak: 2.10,
  pumpI: 4, pumpIII: 4, pumpIV: 2,
  gasConstant: 8.314462618, faraday: 96485.33212,
};

export const DEFAULTS = {
  oxygen: 1, nadh: 1, fadh: 1, adp: 1, pi: 1, leak: 0.1,
  synth: 1, ci: 1, ciii: 1, civ: 1, permeability: 1, temperature: 37,
  rotenone: 0, cyanide: 0, oligomycin: 0, dnp: 0,
  fermentation: "off" as Fermentation, shuttle: "malate" as Shuttle, reverse: false,
};
export type Params = typeof DEFAULTS;
export type NumericParam = Exclude<keyof Params, "fermentation" | "shuttle" | "reverse">;

export interface State {
  time: number; nadh: number; fadh: number; cytNadh: number; shuttleQ: number; oxygen: number;
  adp: number; pi: number; gradient: number; pyruvate: number; acetyl: number;
  atp: number; oxAtp: number; substrateAtp: number; lactate: number; ethanol: number;
  water: number; co2: number; glucose: number; reverseAtp: number; fumarate: number;
}
export interface Reading extends State {
  nad: number; fad: number; cytNad: number; atpRate: number; oxRate: number; substrateRate: number;
  electron: number; pairI: number; pairII: number; pairQ: number; oxygenRate: number; pump: number;
  pumpI: number; pumpIII: number; pumpIV: number; synthH: number; leakH: number;
  psi: number; deltaPH: number; matrixPH: number; imsPH: number; pmf: number; phMv: number;
  heat: number; efficiency: number; po: number | null;
  glycolysis: number; pdh: number; tca: number; shuttleFlow: number; ferment: number;
  succinateRate: number; hydrolysisRate: number; reverseH: number;
}

const sat = (x: number, k: number) => x / (x + k);
const room = (x: number, max: number) => Math.max(0, 1 - x / max);
const limit = (rate: number, available: number, dt: number) => Math.min(rate, Math.max(0, available / dt));

export function initialState(): State {
  return {
    time: 0, nadh: 1.7, fadh: 0.65, cytNadh: 0.7, shuttleQ: 0, oxygen: 3.25,
    adp: 3.4, pi: 4.5, gradient: 8.2, pyruvate: 0.65, acetyl: 0.55,
    atp: 0, oxAtp: 0, substrateAtp: 0, lactate: 0, ethanol: 0, water: 0, co2: 0, glucose: 0, reverseAtp: MODEL.reverseAtpStock, fumarate: 0,
  };
}

export function measure(s: State, p: Params, dt = DT): Reading {
  const m = MODEL;
  const tempK = p.temperature + 273.15;
  const temp = 2 ** ((p.temperature - 37) / 10);
  const psi = -m.chargeMv * s.gradient;
  const matrixPH = 7.2 + s.gradient * m.matrixBuffer;
  const imsPH = 7.2 - s.gradient * m.imsBuffer;
  const deltaPH = matrixPH - imsPH;
  const phMv = (2.303 * m.gasConstant * tempK / m.faraday) * 1000 * deltaPH;
  const pmf = -psi + phMv;

  const i = limit(temp * p.ci * (1 - p.rotenone) * m.iCapacity * sat(s.nadh, 1.3), s.nadh, dt);
  const ii = limit(temp * m.iiCapacity * sat(s.fadh, 0.8), s.fadh, dt);
  const q = limit(temp * m.qCapacity * sat(s.shuttleQ, .65), s.shuttleQ, dt);
  const donor = i + ii + q;
  const backpressure = room(s.gradient, m.maxGradient);
  const terminal = Math.min(
    temp * p.ciii * m.iiiCapacity,
    temp * p.civ * (1 - p.cyanide) * m.ivCapacity * sat(s.oxygen, 0.75),
    2 * s.oxygen / dt,
  );
  const pairs = Math.min(donor, terminal) * backpressure;
  const pairI = donor > 0 ? pairs * i / donor : 0;
  const pairII = donor > 0 ? pairs * ii / donor : 0;
  const pairQ = donor > 0 ? pairs * q / donor : 0;
  const oxygenRate = pairs / 2;
  const pumpI = pairI * m.pumpI;
  const pumpIII = pairs * m.pumpIII;
  const pumpIV = pairs * m.pumpIV;
  const pump = pumpI + pumpIII + pumpIV;
  const leakH = limit(temp * (m.baseLeak * p.permeability + p.leak + m.uncouplingLeak * p.dnp) * s.gradient, s.gradient, dt);
  const adpAvailable = s.adp + dt * 2.0 * p.adp * room(s.adp, m.adpCapacity);
  const piAvailable = s.pi + dt * 2.0 * p.pi * room(s.pi, m.piCapacity);
  const oxRate = Math.min(
    temp * m.synthCapacity * p.synth * (1 - p.oligomycin) *
      sat(Math.max(0, pmf - m.synthesisThresholdMv), 48) * sat(s.adp, 1) * sat(s.pi, 0.8) / m.effectiveHPerAtp,
    Math.max(0, s.gradient / dt - leakH) / m.effectiveHPerAtp, adpAvailable / dt, piAvailable / dt,
  );
  const synthH = oxRate * m.effectiveHPerAtp;
  // The optional experiment provides a separate finite ATP stock and a fixed switching PMF.
  const hydrolysisRate = p.reverse ? Math.min(
    temp * m.reverseCapacity * p.synth * (1 - p.oligomycin) *
      sat(Math.max(0, m.synthesisThresholdMv - pmf), 22) * sat(s.reverseAtp, 1),
    s.reverseAtp / dt,
    Math.max(0, (m.maxGradient - s.gradient) / dt - pump) / m.effectiveHPerAtp,
  ) : 0;
  const reverseH = hydrolysisRate * m.effectiveHPerAtp;

  // Carbon and compartment-specific redox pools limit the upstream fluxes.
  const nad = m.nadPool - s.nadh;
  const fad = m.fadPool - s.fadh;
  const cytNad = m.cytPool - s.cytNadh;
  const glucoseDemand = temp * m.glucoseRate * sat(cytNad, 0.8) * room(s.pyruvate, 6);
  const substrateBudget = Math.max(0, Math.min(adpAvailable, piAvailable) / dt - oxRate);
  const glycolysis = Math.min(glucoseDemand, cytNad / (2 * dt), substrateBudget / 2);
  const pdh = Math.min(
    temp * m.pdhRate * p.nadh * sat(s.pyruvate, 0.3) * sat(nad, 0.8) * room(s.acetyl, 4),
    s.pyruvate / dt, nad / dt,
  );
  const tca = Math.min(
    temp * m.tcaRate * Math.min(p.nadh, p.fadh) * sat(s.acetyl, 0.32) * sat(nad, 0.9) * sat(fad, 0.5),
    s.acetyl / dt, Math.max(0, nad / dt - pdh) / 3, fad / dt, substrateBudget - 2 * glycolysis,
  );
  const succinateRate = Math.min(temp * m.succinateInput * p.fadh * sat(fad, .5), Math.max(0, fad / dt - tca));
  const malate = p.shuttle === "malate";
  const acceptor = malate ? nad : m.shuttleQPool - s.shuttleQ;
  const acceptorRate = acceptor / dt - (malate ? pdh + 3 * tca : 0);
  const shuttleFlow = Math.min(
    temp * m.shuttleRate * (malate ? p.nadh : p.fadh) * sat(s.cytNadh, 0.5) * sat(acceptor, 1)
      * sat(pairs, 0.35),
    s.cytNadh / dt, Math.max(0, acceptorRate),
  );
  const ferment = p.fermentation === "off" ? 0 : Math.min(
    temp * 1.0 * sat(s.pyruvate, 0.25) * sat(s.cytNadh, 0.3),
    Math.max(0, s.pyruvate / dt - pdh), Math.max(0, s.cytNadh / dt - shuttleFlow),
  );
  // Net substrate ATP yield uses ATP equivalents (includes GTP). Both routes require ADP/Pi.
  const substrateRate = 2 * glycolysis + tca;
  return {
    ...s, nad, fad, cytNad, oxRate, substrateRate, atpRate: oxRate + substrateRate,
    electron: 2 * pairs, pairI, pairII, pairQ, oxygenRate, pump, pumpI, pumpIII, pumpIV, synthH, leakH,
    psi, matrixPH, imsPH, deltaPH, phMv, pmf, heat: leakH * pmf / 100,
    efficiency: synthH + leakH > 1e-9 ? synthH / (synthH + leakH) : 0,
    po: pairs > 0.0001 ? oxRate / pairs : null, glycolysis, pdh, tca, shuttleFlow, ferment, succinateRate, hydrolysisRate, reverseH,
  };
}

export function step(s: State, p: Params, dt = DT): State {
  const f = measure(s, p, dt);
  const m = MODEL;
  const nonnegative = (amount: number, rate: number) => Math.max(0, amount + dt * rate);
  return {
    time: s.time + dt,
    nadh: nonnegative(s.nadh, f.pdh + 3 * f.tca + (p.shuttle === "malate" ? f.shuttleFlow : 0) - f.pairI),
    fadh: nonnegative(s.fadh, f.tca + f.succinateRate - f.pairII),
    shuttleQ: nonnegative(s.shuttleQ, (p.shuttle === "glycerol" ? f.shuttleFlow : 0) - f.pairQ),
    cytNadh: nonnegative(s.cytNadh, 2 * f.glycolysis - f.shuttleFlow - f.ferment),
    oxygen: nonnegative(s.oxygen, 2.25 * p.oxygen * room(s.oxygen, m.oxygenCapacity) - f.oxygenRate),
    adp: nonnegative(s.adp, 2.0 * p.adp * room(s.adp, m.adpCapacity) - f.atpRate + f.hydrolysisRate),
    pi: nonnegative(s.pi, 2.0 * p.pi * room(s.pi, m.piCapacity) - f.atpRate + f.hydrolysisRate),
    gradient: nonnegative(s.gradient, f.pump - f.leakH - f.synthH + f.reverseH),
    pyruvate: nonnegative(s.pyruvate, 2 * f.glycolysis - f.pdh - f.ferment),
    acetyl: nonnegative(s.acetyl, f.pdh - f.tca),
    atp: s.atp + dt * f.atpRate,
    oxAtp: s.oxAtp + dt * f.oxRate,
    substrateAtp: s.substrateAtp + dt * f.substrateRate,
    lactate: s.lactate + dt * (p.fermentation === "lactate" ? f.ferment : 0),
    ethanol: s.ethanol + dt * (p.fermentation === "alcohol" ? f.ferment : 0),
    water: s.water + dt * f.oxygenRate * 2,
    co2: s.co2 + dt * (f.pdh + 2 * f.tca + (p.fermentation === "alcohol" ? f.ferment : 0)),
    glucose: s.glucose + dt * f.glycolysis,
    reverseAtp: nonnegative(s.reverseAtp, -f.hydrolysisRate),
    fumarate: s.fumarate + dt * f.succinateRate,
  };
}

export const EXPERIMENTS = [
  { id: "A", name: "정상 세포호흡", en: "Baseline respiration", change: {}, effect: "산소가 전자를 받아 물이 된다. 양성자 펌핑과 ATP 합성이 함께 진행된다." },
  { id: "B", name: "복합체 I 억제", en: "Rotenone", change: { rotenone: 1 }, effect: "NADH 경로가 차단된다. 남아 있는 복합체 II 경로가 유비퀴논에 전자를 공급할 수 있다." },
  { id: "C", name: "복합체 IV 억제", en: "Cyanide", change: { cyanide: 1 }, effect: "산소 환원이 차단된다. 펌핑이 멈추고 남아 있던 기울기가 서서히 소모된다." },
  { id: "D", name: "ATP 합성효소 억제", en: "Oligomycin", change: { oligomycin: 1 }, effect: "ATP 합성효소의 H⁺ 통과가 줄어든다. 초기 기울기가 높아지며 역압이 전자전달을 늦춘다." },
  { id: "E", name: "짝풀림", en: "DNP", change: { dnp: 0.85 }, effect: "막 누출이 늘어난다. 기울기와 결합 효율이 낮아지고 공급 여력이 있으면 산소 소비가 늘어난다." },
  { id: "F", name: "산소 공급 중단", en: "Oxygen withdrawal", change: { oxygen: 0 }, effect: "유입을 중단한다. 저장된 산소가 소모되는 동안 전자전달과 기울기가 차례로 감소한다." },
] as const;

export const CONTROLS: { key: NumericParam; label: string; en: string; min?: number; max?: number; step?: number }[] = [
  { key: "oxygen", label: "산소 공급", en: "O₂ supply" },
  { key: "adp", label: "ADP 공급", en: "ADP supply" },
  { key: "pi", label: "무기인산 공급", en: "Pᵢ supply" },
  { key: "nadh", label: "NADH 공급 능력", en: "NADH input", max: 2 },
  { key: "fadh", label: "FADH₂ 공급 능력", en: "FAD / succinate", max: 2 },
  { key: "leak", label: "양성자 누출 계수", en: "Proton leak", max: 2 },
  { key: "synth", label: "ATP 합성효소 활성", en: "ATP synthase" },
  { key: "ci", label: "복합체 I 활성", en: "Complex I" },
  { key: "ciii", label: "복합체 III 활성", en: "Complex III" },
  { key: "civ", label: "복합체 IV 활성", en: "Complex IV" },
  { key: "permeability", label: "막 투과성", en: "Permeability", max: 4 },
  { key: "temperature", label: "온도", en: "Temperature", min: 20, max: 42, step: 1 },
  { key: "rotenone", label: "로테논", en: "Rotenone · I" },
  { key: "cyanide", label: "시안화물", en: "Cyanide · IV" },
  { key: "oligomycin", label: "올리고마이신", en: "Oligomycin · F₀" },
  { key: "dnp", label: "DNP 짝풀림", en: "DNP · leak" },
];





