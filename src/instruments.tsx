import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, Atom, CircleHelp, Gauge, X, Zap } from "lucide-react";
import { createScene, type View } from "./scene";
import { CONTROLS, type NumericParam, type Params, type Reading } from "./model";
import type { AnatomyId, ProteinId } from "./education";
import type { Lab } from "./lab";

export const COLORS = { electron: "#5de2ce", oxygen: "#ff8d82", atp: "#f9ca7d", pmf: "#ed9bc6", nad: "#84b9f8", fad: "#b293ed" };
export const fmt = (n: number, digits = 2) => n.toFixed(digits);

export function IButton({ title, children, onClick, active, disabled }: { title: string; children: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button type="button" className={"icon" + (active ? " selected" : "")} aria-label={title} title={title} onClick={onClick} aria-pressed={active} disabled={disabled}>{children}</button>;
}

export function Viewer({ lab, view, selectProtein, selectAnatomy, onFps }: {
  lab: Lab; view: View; selectProtein: (id: ProteinId) => void; selectAnatomy: (id: AnatomyId) => void; onFps?: (n: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const live = useRef({ view, selectProtein, selectAnatomy, onFps });
  live.current = { view, selectProtein, selectAnatomy, onFps };
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      return createScene(host.current!, labels.current!, lab, () => live.current.view,
        { protein: id => live.current.selectProtein(id), anatomy: id => live.current.selectAnatomy(id) }, n => live.current.onFps?.(n));
    } catch (e) {
      console.warn("WebGL2 초기화 실패", e);
      setError(true);
    }
  }, [lab]);
  return <>
    <div className="canvas-mount" ref={host}/>
    <div className="scene-labels" ref={labels}/>
    {error && <div className="render-error"><Atom size={27}/><strong>3D 렌더링을 시작할 수 없습니다.</strong><span>WebGL2와 브라우저 그래픽 가속을 확인하세요. 수치와 그래프는 계속 갱신됩니다.</span></div>}
  </>;
}

export function Readouts({ r, more }: { r: Reading; more: boolean }) {
  const cards = [
    { label: "산화적 ATP 생성", en: "ATP SYNTHESIS", value: r.oxRate, unit: "상대량 / s", color: COLORS.atp, icon: Zap },
    { label: "산소 소비", en: "O₂ CONSUMPTION", value: r.oxygenRate, unit: "상대량 / s", color: COLORS.oxygen, icon: Activity },
    { label: "양성자 구동력", en: "PROTON MOTIVE FORCE", value: r.pmf, unit: "모형 mV", color: COLORS.pmf, icon: Gauge },
    { label: "전자전달", en: "ELECTRON TRANSPORT", value: r.electron, unit: "상대량 / s", color: COLORS.electron, icon: Activity },
  ];
  const extra: [string, string][] = [
    ["막전위 Δψ", fmt(r.psi, 1) + " mV"], ["바탕질 / 막사이공간 pH", fmt(r.matrixPH) + " / " + fmt(r.imsPH)],
    ["pH 차이 (바탕질 − 막사이공간)", fmt(r.deltaPH) + " pH"], ["pH 기여분", fmt(r.phMv, 1) + " mV"],
    ["NADH / NAD⁺ · 바탕질", fmt(r.nadh) + " / " + fmt(r.nad)], ["환원 FAD / 셔틀 Q 풀", fmt(r.fadh) + " / " + fmt(r.shuttleQ)],
    ["세포질 NADH / NAD⁺", fmt(r.cytNadh) + " / " + fmt(r.cytNad)], ["남은 O₂", fmt(r.oxygen)],
    ["ADP / Pᵢ", fmt(r.adp) + " / " + fmt(r.pi)], ["I / II / 셔틀 전자쌍", fmt(r.pairI) + " / " + fmt(r.pairII) + " / " + fmt(r.pairQ) + " / s"],
    ["H⁺ 펌핑 / 합성효소 / 누출", [r.pump,r.synthH,r.leakH].map(n => fmt(n, 1)).join(" / ") + " / s"],
    ["누출 열 지표", fmt(r.heat)], ["H⁺ 흐름 결합 효율", fmt(100 * r.efficiency, 1) + " %"],
    ["순간 ATP / O (O = O₂ ½개)", r.po === null ? "—" : fmt(r.po)],
    ["산화적 / 기질수준 누적 ATP", fmt(r.oxAtp) + " / " + fmt(r.substrateAtp)],
    ["누적 H₂O / CO₂", fmt(r.water) + " / " + fmt(r.co2)], ["누적 젖산 / 에탄올", fmt(r.lactate) + " / " + fmt(r.ethanol)],
    ["역방향 가수분해 / H⁺ 펌핑", fmt(r.hydrolysisRate) + " / " + fmt(r.reverseH) + " / s"],
  ];
  return <>
    <div className="instrument-grid">{cards.map(({ label, en, value, unit, color, icon: Icon }) =>
      <div className="instrument" key={label} style={{ "--tone": color } as CSSProperties}>
        <div className="instrument-label"><Icon size={13}/>{label}</div>
        <div className="instrument-value" data-metric={en}>{fmt(value, unit === "모형 mV" ? 1 : 2)}</div>
        <div className="instrument-unit">{unit}</div>
      </div>)}</div>
    {more && <><dl className="readouts">{extra.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="muted note">단위가 생략된 농도와 양은 상대값입니다.</p></>}
  </>;
}

export function Slider({ name, params, onEdit }: { name: NumericParam; params: Params; onEdit: (key: NumericParam, n: number) => void }) {
  const item = CONTROLS.find(c => c.key === name)!;
  const low = item.min ?? 0, high = item.max ?? 1;
  return <label className="lab-slider">
    <span className="slider-line"><span>{item.label} <small>{item.en}</small></span>
      <output>{fmt(params[name], name === "temperature" ? 0 : 2)}{name === "temperature" ? " °C" : ""}</output></span>
    <input type="range" min={low} max={high} step={item.step ?? .01} value={params[name]}
      aria-label={item.label} style={{ "--progress": (100 * (params[name]-low) / (high-low)) + "%" } as CSSProperties}
      onChange={event => onEdit(name, Number(event.target.value))}/>
  </label>;
}

const MEASUREMENTS: { label: string; unit: string; get: (x: Reading) => number; color: string }[] = [
  { label: "전자전달", unit: "상대량 / s", get: x => x.electron, color: COLORS.electron },
  { label: "양성자 구동력", unit: "모형 mV", get: x => x.pmf, color: COLORS.pmf },
  { label: "pH 기울기", unit: "ΔpH", get: x => x.deltaPH, color: COLORS.pmf },
  { label: "ATP 합성효소 H⁺", unit: "상대량 / s", get: x => x.synthH, color: COLORS.atp },
  { label: "산소 소비", unit: "상대량 / s", get: x => x.oxygenRate, color: COLORS.oxygen },
  { label: "산화적 ATP", unit: "상대량 / s", get: x => x.oxRate, color: COLORS.atp },
  { label: "누출 열 지표", unit: "상대값", get: x => x.heat, color: COLORS.oxygen },
];
export function CompareReadings({ lab, baseline }: { lab: Lab; baseline: Lab }) {
  return <section className="panel compare-table">
    <div className="section-heading"><h2>같은 시각의 측정값</h2><span className="mono">{fmt(lab.reading.time, 2)} s</span></div>
    <table><thead><tr><th>지표</th><th>정상 기준</th><th>{lab.label}</th><th>차이</th></tr></thead>
      <tbody>{MEASUREMENTS.map(metric => {
        const base = metric.get(baseline.reading), test = metric.get(lab.reading), diff = test - base;
        return <tr key={metric.label}><th><i style={{ background: metric.color }}/>{metric.label} <small>{metric.unit}</small></th>
          <td>{fmt(base)}</td><td>{fmt(test)}</td><td>{diff > .0049 ? "+" : ""}{fmt(diff)}</td></tr>;
      })}</tbody></table>
  </section>;
}

export function Mark() {
  return <div className="mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 32 32" fill="none">
    <path d="M5 19C5 10 15 5 23 7c8 2 4 10-1 14s-13 8-16 3l-1-5Z" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M7 19c3 2 4-7 7-7s0 9 4 8 3-9 7-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg></div>;
}

export function ModelInfo({ close }: { close: () => void }) {
  return <div className="overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal model-modal" aria-label="모형 설명" aria-modal="true" role="dialog">
      <div className="modal-head"><h2><CircleHelp size={19}/> 모형 설명</h2><IButton title="닫기" onClick={close}><X size={20}/></IButton></div>
      <div className="model-body">
        <h3>전자전달과 질량수지</h3>
        <p>I, II, 글리세롤 3-인산 셔틀의 전자쌍 플럭스는 각 환원당량에 의해 제한됩니다. 세 플럭스가 Q에서 합쳐지고, 공통 III·IV·O₂ 처리 용량과 양성자 역압의 제약을 받습니다. O₂ ½당 전자쌍 1개와 H₂O 1개를 계산합니다. 복합체 I 억제 중 II 경로를 비교할 수 있도록 숙신산 공급을 별도로 둡니다.</p>
        <div className="formula">J<sub>pump</sub> = 4J<sub>I</sub> + 4(J<sub>I</sub> + J<sub>II/Q</sub>) + 2(J<sub>I</sub> + J<sub>II/Q</sub>)</div>
        <p>유효 양성자 풀 S의 변화율은 펌핑 − ATP 합성 시 H⁺ 복귀 − 막 누출입니다. 역방향 실험에서는 ATPase가 펌핑하는 H⁺를 더합니다. ATP는 산화적 인산화와 기질수준 인산화의 합계입니다. NAD⁺와 NADH의 합은 세포질과 바탕질 각각에서 보존됩니다.</p>
        <h3>양성자 구동력 (Proton motive force)</h3>
        <p>막전위 Δψ = ψ<sub>바탕질</sub> − ψ<sub>막사이공간</sub> (음수). ΔpH = pH<sub>바탕질</sub> − pH<sub>막사이공간</sub> (양수). H⁺ 이동 구동의 크기는 −Δp로 표시합니다.</p>
        <div className="formula">Δp = Δψ − (2.303RT / F) ΔpH</div>
        <p>Δψ = −11.4S 모형 mV, 바탕질 pH = 7.20 + 0.032S, 막사이공간 pH = 7.20 − 0.019S로 환산합니다. 서로 다른 완충 계수를 가정했습니다. 3D 입자는 유효 H⁺ 차이의 시각적 표상입니다.</p>
        <h3>수율, 온도와 적용 범위</h3>
        <p>교육용 화학양론은 NADH 경로 10, II/Q 경로 6 H⁺/전자쌍입니다. 인산·뉴클레오타이드 수송 부담을 포함한 유효 비용 4 H⁺/ATP를 사용합니다. 32 ATP는 특정 셔틀과 이상적인 수율을 사용한 포도당당 계산 예입니다.</p>
        <p>속도에 Q₁₀ = 2를 적용하고, 온도를 구동력 환산식에 반영합니다. 실제 효소별 온도 곡선, 막 손상, 세포 유형의 차이는 포함 범위를 벗어납니다. 기본 실험은 합성 방향을 계산합니다. 고급 실험에서는 고정 전환점 56 모형 mV 아래에서 별도 유한 ATP 저장량을 가수분해해 H⁺를 펌핑합니다. 전환점은 ATP/ADP/Pᵢ에 따라 바뀌는 실제 평형을 단순화한 값입니다.</p>
        <p>결합 효율은 합성효소를 통과한 H⁺가 전체 복귀 흐름에서 차지하는 비율입니다. 누출 열 지표는 누출 플럭스 × |Δp|의 상대값입니다. 단백질과 분자는 교육용 개략 구조입니다.</p>
        <h3>참고 문헌</h3>
        <ul>
          <li><a href="https://www.nobelprize.org/uploads/2018/06/mitchell-lecture.pdf" target="_blank" rel="noreferrer">Mitchell · Nobel lecture (1978)</a></li>
          <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC1132431/" target="_blank" rel="noreferrer">Brand et al. · Effective P/O ratio and proton leak (1993)</a></li>
          <li><a href="https://www.nature.com/articles/386299a0" target="_blank" rel="noreferrer">Noji et al. · Direct observation of F₁ rotation (1997)</a></li>
          <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC2782617/" target="_blank" rel="noreferrer">Gnaiger · Functional assessment of isolated mitochondria (2009)</a></li>
        </ul>
      </div>
    </section>
  </div>;
}


