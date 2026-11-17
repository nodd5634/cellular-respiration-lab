import { describe, expect, it } from "vitest";
import { Lab } from "../src/lab";
import { DEFAULTS, DT, EXPERIMENTS, MODEL, initialState, measure, step, type Params, type State } from "../src/model";

function run(changes: Partial<Params> = {}, seconds = 50, start = initialState()) {
  const params = { ...DEFAULTS, ...changes };
  let state: State = start;
  for (let i = 0; i < Math.round(seconds / DT); i++) state = step(state, params);
  return measure(state, params);
}

describe("oxidative phosphorylation", () => {
  it("maintains a gradient, transports electrons and makes ATP under normal conditions", () => {
    const normal = run();
    expect(normal.oxRate).toBeGreaterThan(.5);
    expect(normal.electron).toBeGreaterThan(1);
    expect(normal.pmf).toBeGreaterThan(90);
    expect(normal.psi).toBeLessThan(0);
    expect(normal.matrixPH).toBeGreaterThan(normal.imsPH);
    expect(normal.pmf).toBeCloseTo(-normal.psi + normal.phMv);
  });
  it("consumes residual oxygen, then loses gradient and oxidative ATP", () => {
    const early = run({ oxygen: 0 }, 1);
    const late = run({ oxygen: 0 }, 65);
    const normal = run({}, 65);
    expect(early.oxygen).toBeGreaterThan(0);
    expect(early.electron).toBeGreaterThan(0);
    expect(late.oxygenRate).toBeLessThan(.001);
    expect(late.pump).toBeLessThan(.01);
    expect(late.pmf).toBeLessThan(early.pmf);
    expect(late.oxRate).toBeLessThan(.001);
    expect(late.nadh).toBeGreaterThan(normal.nadh);
  });
  it("selectively blocks the I branch with rotenone", () => {
    const blocked = run(EXPERIMENTS[1].change, 20);
    expect(blocked.pairI).toBe(0);
    expect(blocked.pairII).toBeGreaterThan(.03);
    expect(blocked.pumpI).toBe(0);
    expect(blocked.pump).toBeCloseTo(6 * blocked.pairII, 8);
  });
  it("prevents terminal oxygen reduction with cyanide while residual PMF briefly supports ATP", () => {
    const immediate = measure(initialState(), { ...DEFAULTS, cyanide: 1 });
    expect(immediate.electron).toBe(0);
    expect(immediate.oxygenRate).toBe(0);
    expect(immediate.pump).toBe(0);
    expect(immediate.oxRate).toBeGreaterThan(0);
    expect(run({ cyanide: 1 }).oxRate).toBe(0);
  });
  it("increases backpressure and eventually depresses respiration with oligomycin", () => {
    const baseline = run({}, 60);
    const early = run({ oligomycin: 1 }, 1, baseline);
    const late = run({ oligomycin: 1 }, 25, baseline);
    expect(early.pmf).toBeGreaterThan(baseline.pmf);
    expect(late.oxRate).toBe(0);
    expect(late.synthH).toBe(0);
    expect(late.electron).toBeLessThan(baseline.electron);
    expect(late.oxygenRate).toBeLessThan(baseline.oxygenRate);
  });
  it("reduces PMF and coupling but may increase oxygen use and heat under uncoupling", () => {
    const baseline = run({}, 60);
    const uncoupled = run(EXPERIMENTS[4].change, 55, baseline);
    expect(uncoupled.pmf).toBeLessThan(baseline.pmf);
    expect(uncoupled.efficiency).toBeLessThan(baseline.efficiency);
    expect(uncoupled.oxRate).toBeLessThan(baseline.oxRate);
    expect(uncoupled.oxygenRate).toBeGreaterThan(baseline.oxygenRate);
    expect(uncoupled.heat).toBeGreaterThan(baseline.heat);
    expect(run({ dnp: 1, oxygen: 0 }, 60).oxygenRate).toBeLessThan(.001);
  });
  it.each(["adp", "pi"] as const)("limits both ATP sources when %s is depleted", key => {
    const result = run({ [key]: 0 }, 80);
    expect(result[key]).toBeLessThan(.01);
    expect(result.oxRate).toBeLessThan(.01);
    expect(result.atpRate).toBeLessThan(.01);
  });
});

describe("metabolic stoichiometry and integration", () => {
  it.each(["off", "lactate", "alcohol"] as const)("balances carbon, carrier and ATP equivalents for %s", fermentation => {
    const start = initialState();
    const result = run({ fermentation, oxygen: fermentation === "off" ? 1 : 0 }, 70, start);
    const carbon = (s: State) => 3*s.pyruvate + 2*s.acetyl + s.co2 + 3*s.lactate + 2*s.ethanol - 6*s.glucose;
    expect(carbon(result)).toBeCloseTo(carbon(start), 7);
    expect(result.nadh + result.nad).toBeCloseTo(MODEL.nadPool);
    expect(result.fadh + result.fad).toBeCloseTo(MODEL.fadPool);
    expect(result.cytNadh + result.cytNad).toBeCloseTo(MODEL.cytPool);
    expect(result.atp).toBeCloseTo(result.oxAtp + result.substrateAtp, 7);
    expect(result.oxygenRate * 4).toBeCloseTo(result.electron, 8);
    expect(result.synthH).toBeCloseTo(result.oxRate * MODEL.effectiveHPerAtp, 8);
    if (fermentation !== "off") {
      expect(result[fermentation === "lactate" ? "lactate" : "ethanol"]).toBeGreaterThan(10);
      expect(result.glycolysis).toBeGreaterThan(.1);
      expect(result.ferment).toBeGreaterThan(.1);
      expect(result.oxRate).toBe(0);
      expect(result.tca).toBeLessThan(.001);
      expect(result.atpRate).toBeCloseTo(2 * result.glycolysis, 3);
    }
  });
  it("uses a finite ATP stock for optional reverse pumping once PMF falls", () => {
    const conditions = { oxygen: 0, reverse: true };
    const early = run(conditions, 1);
    const late = run(conditions, 17);
    const exhausted = run(conditions, 240);
    const forwardOnly = run({ oxygen: 0 }, 17);
    expect(early.hydrolysisRate).toBe(0);
    expect(late.reverseAtp).toBeLessThan(MODEL.reverseAtpStock);
    expect(late.reverseH).toBeGreaterThan(.1);
    expect(late.oxRate).toBe(0);
    expect(late.pmf).toBeGreaterThan(forwardOnly.pmf);
    expect(exhausted.reverseAtp).toBeLessThan(.001);
    expect(run({ ...conditions, oligomycin: 1 }, 17).reverseH).toBe(0);
  });
  it("reroutes shuttle electrons without transferring cytosolic NADH molecules", () => {
    const start = initialState();
    const malate = step(start, DEFAULTS);
    const glycerol = step(start, { ...DEFAULTS, shuttle: "glycerol" });
    expect(malate.nadh).toBeGreaterThan(glycerol.nadh);
    expect(glycerol.fadh).toBeCloseTo(malate.fadh);
    expect(glycerol.shuttleQ).toBeGreaterThan(malate.shuttleQ);
    expect(malate.cytNadh).toBeLessThan(start.cytNadh + DT * .64);
  });
  it("keeps finite, positive stocks for 1 h across extremes and changing conditions", () => {
    let state = initialState();
    const choices = [
      DEFAULTS,
      { ...DEFAULTS, oxygen: 0, adp: 0, pi: 0, synth: 0, ci: 0, ciii: 0, civ: 0, temperature: 20, fermentation: "alcohol" as const },
      { ...DEFAULTS, leak: 2, dnp: 1, permeability: 4, temperature: 42, nadh: 2, fadh: 2, shuttle: "glycerol" as const },
      { ...DEFAULTS, rotenone: 1, cyanide: 1, oligomycin: 1, dnp: 0 },
    ];
    for (let i = 0; i < 432_000; i++) {
      state = step(state, choices[Math.floor(i / 18_000) % choices.length]);
      if (i % 120 === 0) {
        expect(Object.values(state).every(x => Number.isFinite(x) && x >= 0)).toBe(true);
        expect(state.nadh).toBeLessThanOrEqual(MODEL.nadPool);
        expect(state.fadh).toBeLessThanOrEqual(MODEL.fadPool);
        expect(state.cytNadh).toBeLessThanOrEqual(MODEL.cytPool);
        expect(state.gradient).toBeLessThanOrEqual(MODEL.maxGradient);
        expect(state.shuttleQ).toBeLessThanOrEqual(MODEL.shuttleQPool);
      }
    }
    expect(state.time).toBeCloseTo(3600, 5);
  });
});

describe("lab lifecycle", () => {
  it("freezes on pause, resets all stocks, and applies inputs to the measurement immediately", () => {
    const lab = new Lab();
    lab.advance(.1);
    lab.toggle();
    const frozen = lab.state;
    lab.advance(1);
    expect(lab.state).toBe(frozen);
    lab.set({ cyanide: 1 });
    expect(lab.reading.oxygenRate).toBe(0);
    expect(lab.state).toBe(frozen);
    lab.reset();
    expect(lab.state).toEqual(initialState());
    expect(lab.history).toHaveLength(1);
    expect(lab.params.cyanide).toBe(1);
  });
  it("starts both compare runs with the same stock and advances them at the same fixed clock", () => {
    const left = new Lab();
    const right = new Lab();
    right.reset({ ...DEFAULTS, dnp: .85 }, "짝풀림");
    expect(left.state).toEqual(right.state);
    for (let i = 0; i < 120; i++) {
      left.advance(i % 2 ? .011 : .033);
      right.advance(i % 2 ? .011 : .033);
    }
    expect(left.state.time).toBe(right.state.time);
    expect(left.reading.pmf).toBeGreaterThan(right.reading.pmf);
  });
});

