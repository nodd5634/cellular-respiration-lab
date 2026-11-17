import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Activity, Download, History, ImageDown, Layers2, Minus, Plus, Trash2 } from "lucide-react";
import type { Reading } from "./model";
import type { Lab } from "./lab";

type Metric = keyof Reading;
type Series = { key: Metric; label: string; color: string; right?: boolean; percent?: boolean };
const CHARTS: { name: string; label: string; unit: string; right?: string; series: Series[] }[] = [
  { name: "ATP", label: "ATP 생성", unit: "상대량 / s", right: "누적 상대량", series: [
    { key: "atpRate", label: "총 ATP 생성률", color: "#f8c576" },
    { key: "oxRate", label: "산화적 ATP 생성률", color: "#57dfc5" },
    { key: "atp", label: "누적 ATP", color: "#ac94ff", right: true },
  ] },
  { name: "O₂", label: "산소 소비", unit: "상대량 / s", series: [{ key: "oxygenRate", label: "O₂ 소비율", color: "#f48d82" }] },
  { name: "PMF", label: "양성자 구동력", unit: "모형 mV", series: [
    { key: "pmf", label: "|Δp|", color: "#f28bbd" }, { key: "psi", label: "Δψ", color: "#7baff9" },
    { key: "phMv", label: "pH 차이의 전압 환산값", color: "#55e0be" },
  ] },
  { name: "e⁻", label: "전자전달", unit: "상대량 / s", series: [
    { key: "electron", label: "전자 전달률", color: "#55e0cf" },
    { key: "pairI", label: "I 전자쌍 / s", color: "#83bcfd" },
    { key: "pairII", label: "II 전자쌍 / s", color: "#b69bff" },
    { key: "pairQ", label: "셔틀 → Q 전자쌍 / s", color: "#f896cc" },
  ] },
  { name: "NAD", label: "산화환원 상태", unit: "상대 농도", series: [
    { key: "nadh", label: "바탕질 NADH", color: "#7bbcff" }, { key: "nad", label: "바탕질 NAD⁺", color: "#50dfc6" },
    { key: "cytNadh", label: "세포질 NADH", color: "#bb99fc" },
  ] },
  { name: "결합 효율", label: "양성자 결합 효율", unit: "%", series: [{ key: "efficiency", label: "합성 H⁺ / 전체 복귀 H⁺", color: "#f4c17d", percent: true }] },
];

const norm = (reading: Reading, s: Series) => (reading[s.key] ?? 0) * (s.percent ? 100 : 1);
const fmt = (n: number) => n.toFixed(Math.abs(n) >= 10 ? 1 : 2);
function nice(n: number) {
  if (n < .000001) return 1;
  const unit = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].find(x => x * unit >= n) ! * unit;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  el.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function exportCsv(lab: Lab, reference?: Lab) {
  const columns = Object.keys(lab.reading) as Metric[];
  const csv = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  const rows = [["experiment", "series", ...columns].join(",")];
  const add = (label: string, kind: string, data: Reading[]) => {
    for (const point of data) rows.push([csv(label), kind, ...columns.map(key => point[key]?.toFixed(6) ?? "")].join(","));
  };
  add(lab.label, "live", [...lab.history.filter(p => p.time < lab.reading.time), lab.reading]);
  if (reference) add(reference.label, "reference", [...reference.history.filter(p => p.time < reference.reading.time), reference.reading]);
  lab.trials.forEach(trial => add(trial.label, "saved", trial.history));
  download(new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }), "cellular-respiration-data.csv");
}

function chartSvg(svg: SVGSVGElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.removeAttribute("class");
  copy.querySelectorAll("[data-cursor]").forEach(node => node.remove());
  copy.setAttribute("width", "960");
  copy.setAttribute("height", "293");
  copy.setAttribute("viewBox", "0 0 960 293");
  copy.querySelector("rect")?.setAttribute("height", "293");
  copy.querySelector("[data-export-legend]")?.removeAttribute("display");
  return new XMLSerializer().serializeToString(copy);
}

async function exportImage(svg: SVGSVGElement) {
  const url = URL.createObjectURL(new Blob([chartSvg(svg)], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 586;
    canvas.getContext("2d")?.drawImage(img, 0, 0, 1920, 586);
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/png"));
    if (blob) download(blob, "cellular-respiration-chart.png");
  } finally { URL.revokeObjectURL(url); }
}

const WINDOWS = [15, 30, 60, 120, Infinity];
export function Analysis({ lab, reference }: { lab: Lab; reference?: Lab }) {
  const [metric, setMetric] = useState(0);
  const [panel, setPanel] = useState<"chart" | "log" | "runs">("chart");
  const [range, setRange] = useState(1);
  const [cursor, setCursor] = useState<number>();
  const [endAt, setEndAt] = useState<number>();
  const [showTrials, setShowTrials] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => { setEndAt(undefined); setCursor(undefined); }, [lab.epoch]);
  const chart = CHARTS[metric];
  const maximumTime = Math.max(15, lab.reading.time, reference?.reading.time ?? 0,
    ...(showTrials ? lab.trials.map(t => t.history.at(-1)?.time ?? 0) : []));
  const end = Math.max(0.01, Math.min(maximumTime, endAt ?? maximumTime));
  const start = Math.max(0, end - WINDOWS[range]);
  const runs = [
    { data: [...lab.history.filter(p => p.time < lab.reading.time), lab.reading], dash: "", alpha: 1 },
    ...(reference ? [{ data: [...reference.history.filter(p => p.time < reference.reading.time), reference.reading], dash: "6 5", alpha: .70 }] : []),
    ...(showTrials ? lab.trials.map((t, i) => ({ data: t.history, dash: ["2 5", "8 3 2 3", "10 6"][i % 3], alpha: .55 })) : []),
  ];
  const values = runs.map(run => {
    const points = run.data.filter(point => point.time >= start && point.time <= end);
    const stride = Math.max(1, Math.ceil(points.length / 700));
    return points.filter((_, i) => i % stride === 0 || i === points.length - 1);
  });
  let minimum = 0, maximum = chart.series[0].percent ? 100 : .01, rightMaximum = 1;
  for (const lines of values) for (const point of lines) for (const s of chart.series) {
    const amount = norm(point, s);
    if (s.right) rightMaximum = Math.max(rightMaximum, amount);
    else { minimum = Math.min(minimum, amount); maximum = Math.max(maximum, amount); }
  }
  const tick = nice((maximum - minimum) / 4);
  const lo = Math.floor(minimum / tick) * tick, hi = Math.ceil(maximum / tick) * tick;
  const maxR = nice(rightMaximum);
  const plot = { x: 56, y: 43, w: chart.right ? 844 : 869, h: 175 };
  const x = (t: number) => plot.x + (t - start) / (end - start) * plot.w;
  const y = (n: number, right?: boolean) => plot.y + plot.h * (1 - (right ? n / maxR : (n - lo) / (hi - lo)));
  const cursorTime = cursor === undefined ? undefined : start + cursor * (end - start);
  const near = cursorTime !== undefined && values[0].length
    ? values[0].reduce((a, b) => Math.abs(b.time - cursorTime) < Math.abs(a.time - cursorTime) ? b : a)
    : undefined;
  const hover = (event: PointerEvent<SVGSVGElement>) => {
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const pos = point.matrixTransform(transform.inverse());
    setCursor(Math.min(1, Math.max(0, (pos.x - plot.x) / plot.w)));
  };

  return <section className="panel analysis" aria-label="데이터 분석">
    <div className="analysis-head">
      <div className="tab-row">
        <button className={panel === "chart" ? "selected" : ""} onClick={() => setPanel("chart")}><Activity size={15}/> 실시간 그래프</button>
        <button className={panel === "log" ? "selected" : ""} onClick={() => setPanel("log")}><History size={15}/> 이벤트</button>
        <button className={panel === "runs" ? "selected" : ""} onClick={() => setPanel("runs")}><Layers2 size={15}/> 기록 {lab.trials.length > 0 && <span className="count">{lab.trials.length}</span>}</button>
      </div>
      <div className="icon-row">
        {panel === "chart" && <button className="icon" title="그래프 PNG 저장" aria-label="그래프 PNG 저장" onClick={() => { const chartNode = svg.current; if (chartNode) void exportImage(chartNode).catch(() => download(new Blob([chartSvg(chartNode)], { type: "image/svg+xml" }), "cellular-respiration-chart.svg")); }}><ImageDown size={16}/></button>}
        <button className="icon" title="CSV 내보내기" aria-label="CSV 내보내기" onClick={() => exportCsv(lab, reference)}><Download size={16}/></button>
      </div>
    </div>
    {panel === "chart" && <>
      <div className="chart-tools">
        <div className="chart-metrics">{CHARTS.map((item, i) => <button type="button" key={item.name} aria-pressed={i === metric} title={item.label}
          className={i === metric ? "selected" : ""} onClick={() => setMetric(i)}>{item.name}</button>)}</div>
        <div className="icon-row">
          <button className="icon small" title="시간축 확대" aria-label="시간축 확대" disabled={range === 0} onClick={() => setRange(range - 1)}><Plus size={14}/></button>
          <button className="icon small" title="시간축 축소" aria-label="시간축 축소" disabled={range === WINDOWS.length - 1} onClick={() => setRange(range + 1)}><Minus size={14}/></button>
          <button className="chip" aria-pressed={endAt === undefined} onClick={() => setEndAt(endAt === undefined ? end : undefined)}>{endAt === undefined ? "실시간" : "시점 고정"}</button>
        </div>
      </div>
      {endAt !== undefined && <label className="chart-scrub">끝 시각 <input type="range" min=".2" max={maximumTime} step=".1" value={endAt} onChange={e => setEndAt(Number(e.target.value))}/><span>{end.toFixed(1)} s</span></label>}
      <svg ref={svg} id="live-analysis-chart" viewBox="0 0 960 263" role="img" aria-label={chart.label + " 시간 변화 그래프"} onPointerMove={hover} onPointerLeave={() => setCursor(undefined)}
        fontFamily="Consolas, Malgun Gothic, sans-serif" fontSize="13">
        <rect width="960" height="263" fill="#111822" rx="8"/>
        <text x={plot.x} y="22" fill="#c6d0df" fontSize="14">{chart.label} · {chart.unit}</text>
        {chart.right && <text x="900" y="22" textAnchor="end" fill="#beadfe">{chart.right} (우축)</text>}
        {Array.from({ length: Math.round((hi - lo) / tick) + 1 }, (_, i) => {
          const amount = lo + i * tick;
          return <g key={i}><line x1={plot.x} x2={plot.x + plot.w} y1={y(amount)} y2={y(amount)} stroke={Math.abs(amount) < 1e-8 ? "#354052" : "#232f3e"} strokeDasharray="4 4"/>
            <text x={plot.x - 10} y={y(amount) + 4} fill="#a5b0c2" textAnchor="end">{fmt(amount)}</text></g>;
        })}
        {chart.right && [0, .25, .5, .75, 1].map(f => <text key={f} x="911" y={y(f * maxR, true) + 4} fill="#ae9de9">{fmt(f * maxR)}</text>)}
        {[0, .2, .4, .6, .8, 1].map(f => {
          const t = start + (end - start) * f;
          return <g key={f}><line x1={x(t)} x2={x(t)} y1={plot.y} y2={plot.y + plot.h} stroke="#232f3e" strokeDasharray="4 5"/>
            <text x={x(t)} y="241" fill="#9caabd" textAnchor="middle">{t.toFixed(1)}s</text></g>;
        })}
        {values.map((line, i) => chart.series.map(s => <g key={i + s.key} opacity={runs[i].alpha}>
          <polyline points={line.map(point => x(point.time).toFixed(2) + "," + y(norm(point, s), s.right).toFixed(2)).join(" ")}
            fill="none" stroke={s.color} strokeWidth={i ? 1.8 : 2.65} strokeDasharray={runs[i].dash} strokeLinejoin="round" strokeLinecap="round"/>
          {!i && line.length > 0 && <circle cx={x(line.at(-1)!.time)} cy={y(norm(line.at(-1)!, s), s.right)} r="3.6" fill={s.color}/>}
        </g>))}
        {near && <g data-cursor=""><line x1={x(near.time)} x2={x(near.time)} y1={plot.y} y2={plot.y + plot.h} stroke="#f4e4c6" strokeWidth="1"/>
          {chart.series.map(s => <circle key={s.key} cx={x(near.time)} cy={y(norm(near, s), s.right)} r="4" fill={s.color}/>)}</g>}
        <g data-export-legend="" display="none">
          {chart.series.map((s, i) => <g key={s.key}><circle cx={56 + i * 211} cy="260" r="3.5" fill={s.color}/>
            <text x={66 + i * 211} y="264" fill="#c6d0df">{s.label}</text></g>)}
          <text x="56" y="282" fill="#c6d0df">{lab.label}{reference ? " · 정상 기준 (파선)" : ""}{showTrials && lab.trials.length ? " · 저장 기록 (점선)" : ""}</text>
        </g>
      </svg>
      <div className="chart-legend">
        {chart.series.map(s => <span key={s.key}><i style={{ background: s.color }}/>{s.label}{near && <b>{fmt(norm(near, s))}</b>}</span>)}
        {near && <span className="mono">{near.time.toFixed(2)} s</span>}
        {reference && <span>┄ 정상 기준</span>}
        {showTrials && lab.trials.length > 0 && <span>··· 저장 기록</span>}
      </div>
    </>}
    {panel === "log" && <div className="logs">{lab.logs.map((log, i) => <div key={i}><time>{log.time.toFixed(2)} s</time><span>{log.text}</span></div>)}</div>}
    {panel === "runs" && <div className="runs">
      <div className="runs-actions"><button className="button gold" onClick={() => lab.save()}>현재 실험 저장</button>
        <label><input type="checkbox" checked={showTrials} onChange={e => setShowTrials(e.target.checked)}/> 저장 기록 겹쳐 보기</label>
        <button className="button" onClick={() => { reference?.clear(); lab.clear(); setEndAt(undefined); }}><Trash2 size={14}/> 결과 초기화</button></div>
      {lab.trials.length === 0 ? <p>현재 실험을 저장하면 다른 실험을 실행한 뒤 같은 그래프에 겹쳐 볼 수 있습니다.</p> :
        lab.trials.map((trial, i) => <details key={trial.id}><summary>{i + 1}. {trial.label} · {trial.history.at(-1)?.time.toFixed(1)} s</summary>
          <p>종료 조건 · O₂ {trial.params.oxygen.toFixed(2)} · ADP {trial.params.adp.toFixed(2)} · DNP {trial.params.dnp.toFixed(2)}</p>
          <button className="chip" onClick={() => { lab.trials = lab.trials.filter(t => t.id !== trial.id); lab.publish(); }}>삭제</button></details>)}
    </div>}
  </section>;
}


