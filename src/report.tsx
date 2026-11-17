import { useState } from "react";
import { Camera, Download, Printer, X } from "lucide-react";
import { CONTROLS, type Reading } from "./model";
import type { Lab } from "./lab";
import { download } from "./analysis";

const FIELDS = [
  ["title", "실험 제목"], ["purpose", "탐구 목적"], ["hypothesis", "가설"],
  ["independent", "독립변인"], ["dependent", "종속변인"], ["fixed", "통제변인"],
  ["conditions", "실험 조건"], ["result", "결과"], ["interpretation", "해석"],
  ["conclusion", "결론"], ["limits", "모델의 한계"],
] as const;
type Field = typeof FIELDS[number][0];
type Draft = Record<Field, string>;
const EMPTY: Draft = {
  title: "", purpose: "", hypothesis: "", independent: "", dependent: "", fixed: "",
  conditions: "", result: "", interpretation: "", conclusion: "", limits: "",
};
const STORAGE = "respiration-lab-report-v1";
function draft(): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(STORAGE) ?? "{}") }; }
  catch { return { ...EMPTY }; }
}
function record(lab: Lab, baseline?: Lab) {
  return [lab, ...(baseline ? [baseline] : [])].map(item => ({
    label: item.label, params: { ...item.params }, latest: item.reading,
    points: [...item.history.filter(x => x.time < item.reading.time), item.reading], events: [...item.logs],
  }));
}
type Capture = ReturnType<typeof record>[number];
type Header = { title: string; unit: string; key: keyof Reading };
const RESULTS: Header[] = [
  { title: "총 ATP", unit: "상대량", key: "atp" },
  { title: "산화적 ATP", unit: "상대량 / s", key: "oxRate" },
  { title: "산소 소비", unit: "상대량 / s", key: "oxygenRate" },
  { title: "양성자 구동력", unit: "모형 mV", key: "pmf" },
  { title: "누출 열 지표", unit: "상대값", key: "heat" },
];
const GRAPH: { key: keyof Reading; label: string; color: string }[] = [
  { key: "oxRate", label: "산화적 ATP 생성률", color: "#b16b0d" },
  { key: "oxygenRate", label: "O₂ 소비율", color: "#137e83" },
];
function ReportChart({ records }: { records: Capture[] }) {
  const first = Math.min(...records.map(run => run.points[0].time));
  const last = Math.max(first + .1, ...records.map(run => run.latest.time));
  let max = .1;
  for (const run of records) for (const point of run.points) max = Math.max(max, point.oxRate, point.oxygenRate);
  const x = (t: number) => 54 + (t - first) / (last - first) * 586;
  const y = (n: number) => 156 - 118 * n / max;
  return <figure className="report-graph">
    <svg viewBox="0 0 680 186" role="img" aria-label="산화적 ATP 생성 및 산소 소비 그래프" fontSize="11" fontFamily="sans-serif">
      <rect width="680" height="186" fill="#fff"/>
      <text x="54" y="20" fill="#344254">속도 (상대량 / s)</text>
      {[0, .25, .5, .75, 1].map(p => <g key={p}>
        <line x1="54" x2="640" y1={y(p * max)} y2={y(p * max)} stroke="#c6cfda" strokeDasharray="4 4"/>
        <text x="45" y={y(p * max) + 3} textAnchor="end" fill="#516176">{(p * max).toFixed(2)}</text>
        <text x={54 + p * 586} y="176" textAnchor="middle" fill="#516176">{(first + p * (last - first)).toFixed(1)} s</text>
      </g>)}
      {records.map((run, i) => GRAPH.map(s => {
        const stride = Math.ceil(run.points.length / 650);
        if (run.points.length === 1) {
          const point = run.points[0];
          return <circle key={i + s.key} cx={x(point.time)} cy={y(point[s.key] ?? 0)} r="3" fill={i ? "#fff" : s.color} stroke={s.color}/>;
        }
        return <polyline key={i + s.key} points={run.points.filter((_, j) => j % stride === 0 || j === run.points.length - 1)
          .map(reading => x(reading.time).toFixed(2) + "," + y(reading[s.key] ?? 0).toFixed(2)).join(" ")}
          fill="none" stroke={s.color} strokeWidth="2.4" strokeDasharray={i ? "5 4" : ""}/>;
      }))}
    </svg>
    <figcaption>{GRAPH.map(series => <span key={series.key} style={{ color: series.color }}>● {series.label}</span>)}{records.length > 1 && <span>┄ 정상 기준</span>}</figcaption>
  </figure>;
}

export function Report({ lab, baseline, close }: { lab: Lab; baseline?: Lab; close: () => void }) {
  const [fields, setFields] = useState(draft);
  const [records, setRecords] = useState(() => record(lab, baseline));
  const edit = (key: Field, value: string) => {
    const next = { ...fields, [key]: value };
    setFields(next);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* private browser session */ }
  };
  const csv = () => {
    const keys = Object.keys(records[0].latest) as (keyof Reading)[];
    const data = records.flatMap(run => run.points.map(p => [
      '"' + run.label.replaceAll('"', '""') + '"', ...keys.map(key => p[key]?.toFixed(6) ?? ""),
    ].join(",")));
    download(new Blob(["\uFEFFexperiment," + keys.join(",") + "\r\n" + data.join("\r\n")], { type: "text/csv;charset=utf-8" }), "respiration-report-data.csv");
  };
  return <div className="overlay report-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal report-modal" role="dialog" aria-modal="true" aria-label="실험 보고서">
      <div className="modal-head no-print">
        <h2>실험 보고서</h2>
        <div className="icon-row">
          <button className="button" onClick={() => setRecords(record(lab, baseline))}><Camera size={15}/> 현재 데이터 첨부</button>
          <button className="icon" title="첨부 CSV 저장" aria-label="첨부 CSV 저장" onClick={csv}><Download size={17}/></button>
          <button className="button gold" onClick={() => window.print()}><Printer size={16}/> 인쇄 / PDF</button>
          <button className="icon" title="닫기" aria-label="닫기" onClick={close}><X size={19}/></button>
        </div>
      </div>
      <article className="paper">
        <div className="report-kicker">CELLULAR RESPIRATION LAB</div>
        <h1>{fields.title || "세포호흡 실험 보고서"}</h1>
        <p>가상 실험 데이터 · 교육용 축약 동역학 모델</p>
        <p className="report-disclaimer">농도와 속도는 모델 상대량이다. 전위와 pH는 유효 양성자 풀에서 환산했다. 수치는 모형 내의 조건 비교에 사용한다.</p>
        <div className="report-fields">
          {FIELDS.map(([key, label]) => <label key={key}>
            <span>{label}</span>
            {key === "title" ? <input value={fields[key]} onChange={e => edit(key, e.target.value)} placeholder="실험 이름을 입력하세요"/> :
              <textarea rows={2} value={fields[key]} onChange={e => edit(key, e.target.value)} placeholder={key === "limits" ? "가정과 적용 범위를 적으세요" : "직접 입력"}/>}
            <p className="print-text">{fields[key] || "—"}</p>
          </label>)}
        </div>
        <h2>실험 데이터</h2>
        <table><thead><tr><th>실험 · 시각</th>{RESULTS.map(entry => <th key={entry.key}>{entry.title}<br/><small>{entry.unit}</small></th>)}</tr></thead>
          <tbody>{records.map((run, i) => <tr key={i}><th>{run.label}<br/><small>{run.latest.time.toFixed(2)} s</small></th>
            {RESULTS.map(entry => <td key={entry.key}>{run.latest[entry.key]?.toFixed(2)}</td>)}</tr>)}</tbody>
        </table>
        <ReportChart records={records}/>
        {records.map((run, i) => <details open className="report-conditions" key={i}><summary>{run.label} · 첨부 시점 조건</summary><p>
          {CONTROLS.map(({ key, label }) => label + " " + run.params[key].toFixed(2) + (key === "temperature" ? " °C" : "")).join(" · ")}
          {" · 셔틀 " + run.params.shuttle + " · 발효 " + run.params.fermentation + " · ATPase 역방향 " + (run.params.reverse ? "허용" : "꺼짐")}</p>
          <p>{run.events.slice(0, 8).reverse().map(event => event.time.toFixed(1) + " s " + event.text).join(" / ")}</p>
        </details>)}
      </article>
    </section>
  </div>;
}

