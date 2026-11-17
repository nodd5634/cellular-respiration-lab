import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowLeft, ArrowRight, Atom, Beaker, BookOpen, Box, ChevronDown, ChevronRight, CircleHelp, Crosshair,
  FileText, FlaskConical, Focus, Layers3, Maximize, Minimize, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  PanelRightOpen, Pause, Play, RotateCcw, ScanLine, Settings2, SplitSquareHorizontal, Thermometer,
} from "lucide-react";
import "@fontsource-variable/dm-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "./style.css";
import { Analysis } from "./analysis";
import { Report } from "./report";
import { ANATOMY, LESSONS, PATHS, PROTEINS, type AnatomyId, type Path, type ProteinId, type Scale } from "./education";
import { Lab } from "./lab";
import { CONTROLS, DEFAULTS, EXPERIMENTS, type NumericParam, type Params } from "./model";
import type { View } from "./scene";
import { COLORS, CompareReadings, fmt, IButton, Mark, ModelInfo, Readouts, Slider, Viewer } from "./instruments";

const INITIAL_VIEW: View = {
  scale: "organelle", reaction: 0, protein: "ATP", anatomy: "cristae",
  cut: true, cutAngle: 0, cutOffset: .44, opacity: .88,
  spin: false, labels: true, quality: "high", home: 0, focus: 0,
};
const SCALES = [
  { id: "organelle", ko: "소기관", en: "Organelle view", icon: Box },
  { id: "membrane", ko: "내막", en: "Membrane view", icon: Layers3 },
  { id: "molecular", ko: "분자", en: "Molecular view", icon: Atom },
] as const;
const activeEffects = (p: Params) => [
  p.rotenone > 0 && "복합체 I 진입 억제", p.cyanide > 0 && "복합체 IV 산소 환원 억제",
  p.oligomycin > 0 && "F₀ 양성자 이동 억제", p.dnp > 0 && "막의 H⁺ 우회 누출 증가",
  p.oxygen === 0 && "O₂ 공급 중단 · 잔류 산소 소비",
].filter(Boolean).join(" · ");

function App() {
  const [{ lab, baseline }] = useState(() => ({ lab: new Lab(), baseline: new Lab() }));
  useSyncExternalStore(lab.subscribe, lab.snapshot);
  const [mode, setMode] = useState<"lab" | "learn" | "compare">("lab");
  const [view, setView] = useState(INITIAL_VIEW);
  const [selected, setSelected] = useState<string>("A");
  const [lesson, setLesson] = useState(0);
  const [answer, setAnswer] = useState(false);
  const [more, setMore] = useState(false);
  const [settings, setSettings] = useState(false);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [leftWidth, setLeftWidth] = useState(228);
  const [rightWidth, setRightWidth] = useState(290);
  const [modal, setModal] = useState<"model" | "report">();
  const [full, setFull] = useState(false);
  const [fps, setFps] = useState(0);
  const viewport = useRef<HTMLElement>(null);
  const comparing = mode === "compare";
  const currentLesson = LESSONS[lesson];
  const protein = PROTEINS.find(p => p.id === view.protein)!;
  const anatomy = ANATOMY.find(a => a.id === view.anatomy)!;
  const path = view.path ? PATHS[view.path] : undefined;
  const reaction = path?.stages[view.reaction];
  const active = EXPERIMENTS.find(item => item.id === selected);
  const r = lab.reading;
  const updates = (part: Partial<View>) => setView(v => ({ ...v, ...part }));
  const selectProtein = (id: ProteinId) => setView(v => ({ ...v, protein: id, focus: v.focus + 1 }));
  const selectAnatomy = (id: AnatomyId) => setView(v => ({ ...v, anatomy: id, focus: v.focus + 1 }));
  const openScale = (scale: Scale) => setView(v => ({ ...v, scale, path: undefined, focus: 0, home: v.home + 1 }));
  const setExperiment = (id: string) => {
    const experiment = EXPERIMENTS.find(e => e.id === id);
    if (!experiment) return;
    setSelected(experiment.id);
    const params = { ...DEFAULTS, shuttle: lab.params.shuttle, ...experiment.change };
    if (comparing) {
      baseline.reset({ ...DEFAULTS, shuttle: params.shuttle }, "정상 기준");
      lab.reset(params, experiment.name);
    } else lab.set(params, experiment.name + " · " + experiment.en, experiment.name);
  };
  const advanced = () => {
    const params = { ...DEFAULTS, oxygen: 0, reverse: true, shuttle: lab.params.shuttle };
    setSelected("custom");
    if (mode === "learn") setMode("lab");
    if (comparing) baseline.reset({ ...DEFAULTS, shuttle: params.shuttle }, "정상 기준");
    lab.reset(params, "ATPase 역방향");
    setView(v => ({ ...v, scale: "molecular", protein: "ATP", path: undefined, focus: 0, home: v.home + 1 }));
  };
  const reset = () => {
    if (comparing) baseline.reset({ ...DEFAULTS, shuttle: baseline.params.shuttle }, "정상 기준");
    lab.reset();
  };
  const changeMode = (next: typeof mode) => {
    if (mode === next) return;
    if (next === "compare") {
      const experimental = selected === "A" ? { ...DEFAULTS, shuttle: lab.params.shuttle, ...EXPERIMENTS[4].change } : lab.params;
      const label = selected === "A" ? EXPERIMENTS[4].name : lab.label;
      if (selected === "A") setSelected("E");
      baseline.running = lab.running;
      baseline.speed = lab.speed;
      baseline.reset({ ...DEFAULTS, shuttle: lab.params.shuttle }, "정상 기준");
      lab.reset(experimental, label);
      openScale("membrane");
    }
    setMode(next);
  };
  const ferment = (id: "lactate" | "alcohol") => {
    setSelected("custom");
    lab.set({ oxygen: 0, fermentation: id }, PATHS[id].title + " · O₂ 공급 중단", PATHS[id].title);
  };
  const pathTo = (id: Path) => {
    if (comparing) setMode("lab");
    updates({ path: id, reaction: 0 });
    if (id === "lactate" || id === "alcohol") ferment(id);
  };
  const learn = (index: number) => {
    const item = LESSONS[index];
    setMode("learn"); setLesson(index); setAnswer(false);
    setView(v => ({ ...v, scale: item.scale, path: item.path, reaction: 0, protein: item.protein ?? "ATP", home: v.home + 1, focus: 0 }));
    if (item.path === "lactate" || item.path === "alcohol") ferment(item.path);
  };
  const changeParam = (key: NumericParam, n: number) => {
    setSelected("custom");
    const label = CONTROLS.find(c => c.key === key)!.label;
    if (lab.logs[0]?.text.startsWith(label + " →")) lab.logs = lab.logs.slice(1);
    lab.set({ [key]: n }, label + " → " + n.toFixed(2), "사용자 조건");
  };
  const fullscreen = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (full) { setFull(false); return; }
    try {
      if (!viewport.current?.requestFullscreen) { setFull(true); return; }
      await viewport.current.requestFullscreen();
    } catch { setFull(true); }
  };
  const changeSize = (edge: "left" | "right", x: number) => {
    const desired = edge === "left" ? x : document.documentElement.clientWidth - x;
    const width = Math.round(Math.max(190, Math.min(edge === "left" ? 325 : 422, desired)));
    (edge === "left" ? setLeftWidth : setRightWidth)(width);
  };

  useEffect(() => Lab.play(comparing ? [baseline, lab] : [lab]), [lab, baseline, comparing]);
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setModal(undefined); setSettings(false); if (!document.fullscreenElement) setFull(false); }
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("fullscreenchange", sync); window.removeEventListener("keydown", escape); };
  }, []);

  return <>
    <div className="application">
      <header className="topbar">
        <div className="brand"><Mark/><div><strong>Cellular Respiration Lab</strong><span>세포호흡 실험실</span></div></div>
        <nav className="topnav" aria-label="작업 모드">
          <button className={mode === "lab" ? "selected" : ""} onClick={() => changeMode("lab")}><FlaskConical size={16}/> 실험실</button>
          <button className={mode === "learn" ? "selected" : ""} onClick={() => { if (mode !== "learn") learn(lesson); }}><BookOpen size={16}/> 학습</button>
          <button className={comparing ? "selected" : ""} onClick={() => changeMode("compare")}><SplitSquareHorizontal size={16}/> 실험 비교</button>
          <button onClick={() => setModal("report")}><FileText size={16}/> 보고서</button>
        </nav>
        <div className="top-actions">
          <span className={"live-indicator " + (lab.running ? "" : "stopped")}><i/>{lab.running ? "실행 중" : "일시정지"}</span>
          <button className="play-button" title={lab.running ? "일시정지" : "재생"} aria-label={lab.running ? "일시정지" : "재생"}
            onClick={() => { lab.toggle(); baseline.running = lab.running; }} >{lab.running ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button>
          <select aria-label="시뮬레이션 속도" value={lab.speed} onChange={e => { lab.speed = Number(e.target.value); baseline.speed = lab.speed; lab.publish(); }}>
            {[.25, .5, 1, 2, 4].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
          <IButton title="시뮬레이션 초기화" onClick={reset}><RotateCcw size={17}/></IButton>
          <IButton title="설정" onClick={() => setSettings(!settings)} active={settings}><Settings2 size={17}/></IButton>
          {settings && <div className="settings-pop panel">
            <div className="section-label">뷰포트 설정</div>
            <label>렌더링 품질<select aria-label="렌더링 품질" value={view.quality} onChange={e => updates({ quality: e.target.value as View["quality"] })}><option value="high">고품질</option><option value="performance">성능 우선</option></select></label>
            <label>구조 레이블<input type="checkbox" checked={view.labels} onChange={e => updates({ labels: e.target.checked })}/></label>
            <label>외막 불투명도<input type="range" min="0" max="1" step=".02" value={view.opacity} onChange={e => updates({ opacity: Number(e.target.value) })}/></label>
            <label>단면 위치<input type="range" min="-1.0" max="1.42" step=".02" value={view.cutOffset} onChange={e => updates({ cutOffset: Number(e.target.value), cut: true })}/></label>
            <label>단면 각도<input type="range" min="-.9" max=".9" step=".01" value={view.cutAngle} onChange={e => updates({ cutAngle: Number(e.target.value), cut: true })}/></label>
            <button className="button" onClick={() => { setSettings(false); setModal("model"); }}><CircleHelp size={15}/> 과학적 모형 설명</button>
          </div>}
        </div>
      </header>

      <div className="workspace" style={{ "--left": (left ? leftWidth : 44) + "px", "--right": (right ? rightWidth : 44) + "px" } as CSSProperties}>
        <aside className={"rail left-rail " + (left ? "" : "collapsed")}>
          <div className="rail-title">{left && <span>{mode === "learn" ? "학습 탐색" : "실험 탐색"}</span>}<IButton title={left ? "탐색 패널 접기" : "탐색 패널 펼치기"} onClick={() => setLeft(!left)}>{left ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</IButton></div>
          {left && <div className="rail-content">
            {mode === "learn" && <div className="nav-block">
              <div className="section-label"><BookOpen size={14}/> 학습 단계</div>
              {LESSONS.map((item, i) => <button className={"nav-item lesson-item " + (i === lesson ? "selected" : "")} key={item.en} onClick={() => learn(i)}>
                <span className="nav-index">{String(i + 1).padStart(2, "0")}</span><span>{item.title}</span>{i === lesson && <ChevronRight size={14}/>}
              </button>)}
            </div>}
            {mode !== "learn" && <>
              <div className="nav-block">
                <div className="section-label"><FlaskConical size={14}/> 실험 조건</div>
                {EXPERIMENTS.map(e => <button className={"nav-item " + (selected === e.id ? "selected" : "")} key={e.id} onClick={() => setExperiment(e.id)}>
                  <span className="nav-index">{e.id}</span><span><strong>{e.name}</strong><small>{e.en}</small></span>{selected === e.id && <ChevronRight size={15}/>}
                </button>)}
              </div>
              <div className="nav-block paths">
                <div className="section-label"><Layers3 size={14}/> 대사 경로</div>
                {(Object.keys(PATHS) as Path[]).map(id =>
                  <button className={"path-item " + (id === view.path ? "selected" : "")} key={id} onClick={() => pathTo(id)}>
                    <span>{PATHS[id].title}</span><ChevronRight size={14}/>
                  </button>)}
              </div>
            </>}
            <button className="model-link" onClick={() => setModal("model")}><CircleHelp size={16}/> 모형과 부호 규약 <ChevronRight size={14}/></button>
          </div>}
          {left && <div className="resizer resizer-left" role="separator" aria-label="탐색 패널 너비" aria-orientation="vertical" tabIndex={0}
            onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") changeSize("left", leftWidth + (e.key === "ArrowLeft" ? -10 : 10)); }}
            onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) changeSize("left", e.clientX); }}/>}
        </aside>
        <main className="center">
          <div className="page-head">
            <div><div className="eyebrow"><span className="eyebrow-line"/>{comparing ? "COMPARATIVE EXPERIMENT" : mode === "learn" ? "GUIDED LEARNING" : "BIOENERGETICS WORKBENCH"}</div>
              <h1>{comparing ? "호흡 조건 비교" : path?.title ?? (mode === "learn" ? currentLesson.title : lab.params.reverse ? "ATPase 역방향" : "마이토콘드리아")}</h1>
              <p>{comparing ? "같은 초기 상태에서 정상 기준과 조작 조건을 관찰합니다." : path?.en ?? (mode === "learn" ? currentLesson.en : lab.params.reverse ? "Reverse ATP synthase" : "전자전달계 · 화학삼투 · 산화적 인산화")}</p></div>
            <div className="timer"><span>시뮬레이션 시간</span><div><strong>{fmt(r.time, 1)}</strong> <span>s</span></div></div>
          </div>

          <section ref={viewport} className={"panel viewport " + (full ? "fullscreen " : "") + (comparing ? "comparison-viewport" : "")} aria-label="3D 관찰 화면">
            <div className="view-bar">
              <div className="view-selector" aria-label="관찰 스케일">
                {SCALES.map(({ id, ko, en, icon: Icon }) =>
                  <button className={!view.path && view.scale === id ? "selected" : ""} title={en} aria-pressed={!view.path && view.scale === id} key={id} onClick={() => openScale(id)}><Icon size={15}/>{ko}</button>)}
                {view.path && <span className="view-path"><Layers3 size={14}/>{path?.place}</span>}
              </div>
              <div className="icon-row">
                <IButton title="단면 보기" active={view.cut && view.scale === "organelle" && !view.path} disabled={view.scale !== "organelle" || Boolean(view.path)} onClick={() => updates({ cut: !view.cut })}><ScanLine size={16}/></IButton>
                <IButton title="자동 회전" active={view.spin} onClick={() => updates({ spin: !view.spin })}><RotateCcw size={15}/></IButton>
                <IButton title="카메라 초기 위치" onClick={() => updates({ focus: 0, home: view.home + 1 })}><Focus size={17}/></IButton>
                <IButton title={full ? "전체 화면 닫기" : "전체 화면"} onClick={() => void fullscreen()}>{full ? <Minimize size={16}/> : <Maximize size={16}/>}</IButton>
              </div>
            </div>

            <div className={comparing ? "canvas-grid split" : "canvas-grid"}>
              {comparing && <div className="specimen" key="reference">
                <div className="specimen-tag"><span className="ref-dot"/>정상 기준</div>
                <Viewer lab={baseline} view={view} selectProtein={selectProtein} selectAnatomy={selectAnatomy}/>
              </div>}
              <div className="specimen" key="primary">
                <div className="specimen-tag"><span className={comparing ? "exp-dot" : "reticle"}/>{comparing ? lab.label : view.path ? path?.en : SCALES.find(s => s.id === view.scale)!.en}</div>
                <Viewer lab={lab} view={view} selectProtein={selectProtein} selectAnatomy={selectAnatomy} onFps={setFps}/>
                {!comparing && !path && <div className="canvas-caption"><Crosshair size={13}/><span>드래그 회전</span><b>·</b><span>스크롤 확대</span><b>·</b><span>우클릭 드래그 이동</span></div>}
                <div className="frame-corner"><span>{fps ? fps + " FPS" : "WebGL2"}</span></div>
                {path && reaction && <div className="reaction-tag"><span>{reaction.byproducts}</span><strong>{reaction.name}</strong><small>{fmt(r[path.rate])} 상대량 / s · 경로 전체</small></div>}
              </div>
            </div>
            <div className="view-footer">
              {!path && <div className="legend">
                <span><i style={{ "--tone": COLORS.electron } as CSSProperties}/> e⁻ 전자</span>
                <span><i style={{ "--tone": COLORS.pmf } as CSSProperties}/> H⁺ 양성자</span>
                {view.scale !== "organelle" && <><span><i style={{ "--tone": COLORS.fad } as CSSProperties}/> II/Q 진입</span><span><i style={{ "--tone": COLORS.oxygen } as CSSProperties}/> O₂ 산소</span></>}
                <span><i style={{ "--tone": COLORS.atp } as CSSProperties}/> {view.scale === "organelle" ? "H⁺ 복귀" : "ATP"}</span>
              </div>}
              {path && <div className="legend"><span><i style={{ "--tone": COLORS.electron } as CSSProperties}/> 탄소 골격 모형</span><span><i style={{ "--tone": COLORS.atp } as CSSProperties}/> 반응 흐름</span></div>}
              <button className="subtle-link" onClick={() => setModal("model")}>교육용 개략 모형 <CircleHelp size={13}/></button>
            </div>
          </section>

          {comparing && <CompareReadings lab={lab} baseline={baseline}/>}

          {path && reaction && <section className="panel pathway-card">
            <div className="section-heading"><h2>{path.title} 반응 탐색</h2><span>{path.place}</span></div>
            <div className="reaction-stepper">
              {path.stages.map((step, i) => <button key={step.name} className={view.reaction === i ? "selected" : ""} onClick={() => updates({ reaction: i })}>
                <b>{step.carbon}C{step.copies ? " × " + step.copies : ""}</b>{step.name}</button>)}
            </div>
            <p>{reaction.action}</p>
            <div className="pathway-flow" aria-label="연결된 세포호흡 경로">
              <button className="chip" onClick={() => pathTo("glycolysis")}>해당 {fmt(r.glycolysis)}</button><ArrowRight size={13}/>
              <button className="chip" onClick={() => pathTo("pdh")}>피루브산 산화 {fmt(r.pdh)}</button><ArrowRight size={13}/>
              <button className="chip" onClick={() => pathTo("tca")}>TCA {fmt(r.tca)}</button><ArrowRight size={13}/>
              <button className="chip" onClick={() => openScale("membrane")}>전자전달 {fmt(r.electron / 2)}</button>
              <span>모형 플럭스 / s</span>
            </div>
            <div className="path-link">{view.path === "tca" ? "재생된 옥살아세트산이 아세틸기와 결합해 다음 회전을 시작합니다." : view.path === "pdh" ? "아세틸-CoA → TCA 회로 · NADH → 복합체 I" : "세포질 NADH → 환원력 셔틀 또는 발효 → NAD⁺ 재생"}</div>
            {(view.path === "lactate" || view.path === "alcohol") && <details className="ferment-table"><summary>산소호흡과 발효 비교</summary>
              <table><thead><tr><th>비교 항목</th><th>산소호흡</th><th>젖산 / 알코올 발효</th></tr></thead>
                <tbody><tr><th>장소</th><td>세포질과 마이토콘드리아</td><td>세포질</td></tr><tr><th>전자 수용</th><td>IV에서 O₂ 환원</td><td>피루브산 / 아세트알데하이드 환원</td></tr>
                  <tr><th>ATP</th><td>기질수준 + 산화적 인산화 · 포도당당 약 30–32 예</td><td>해당 과정의 순 ATP 2 · 발효 단계 자체 0</td></tr></tbody>
              </table>
              <button className="button" onClick={() => pathTo(view.path === "lactate" ? "alcohol" : "lactate")}>다른 발효 경로 열기 <ArrowRight size={14}/></button>
            </details>}
          </section>}

          {mode === "learn" && <section className="panel lesson-card">
            <div className="section-heading"><h2>{currentLesson.title}</h2><span className="mono">{lesson + 1} / {LESSONS.length}</span></div>
            <strong>{currentLesson.summary}</strong><p>{currentLesson.detail}</p>
            <div className="question"><CircleHelp size={17}/><div><strong>{currentLesson.question}</strong>{answer && <p>{currentLesson.answer}</p>}</div>
              <button className="chip" aria-expanded={answer} onClick={() => setAnswer(!answer)}>{answer ? "답 숨기기" : "답 보기"}</button></div>
            <div className="lesson-actions">
              <button className="button" disabled={lesson === 0} onClick={() => learn(lesson - 1)}><ArrowLeft size={15}/> 이전</button>
              <button className="button" onClick={() => view.path === "lactate" || view.path === "alcohol" ? ferment(view.path) : setExperiment(currentLesson.experiment)}><Beaker size={15}/> 관련 실험 적용</button>
              <button className="button gold" disabled={lesson === LESSONS.length - 1} onClick={() => learn(lesson + 1)}>다음 <ArrowRight size={15}/></button>
            </div>
          </section>}
          <Analysis lab={lab} reference={comparing ? baseline : undefined}/>
        </main>

        <aside className={"rail right-rail " + (right ? "" : "collapsed")}>
          <div className="rail-title">{right && <span><Activity size={16}/> 실시간 계측</span>}<IButton title={right ? "계측 패널 접기" : "계측 패널 펼치기"} onClick={() => setRight(!right)}>{right ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</IButton></div>
          {right && <div className="rail-content">
            <Readouts r={r} more={more}/>
            <button className="expand-readings" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "상세 측정 접기" : "상세 측정 펼치기"} <ChevronDown size={14} className={more ? "flipped" : ""}/></button>
            <section className="rail-section">
              <div className="section-label"><Settings2 size={14}/> 실험 변수 <span>상대값</span></div>
              {(["oxygen", "adp", "pi", "nadh", "fadh"] as const).map(key => <Slider key={key} name={key} params={lab.params} onEdit={changeParam}/>)}
              <details className="rail-details"><summary><Thermometer size={14}/> 활성 · 투과성 · 온도 <ChevronDown size={14}/></summary>
                {(["synth", "ci", "ciii", "civ", "leak", "permeability", "temperature"] as const).map(key => <Slider key={key} name={key} params={lab.params} onEdit={changeParam}/>)}
              </details>
              <details className="rail-details"><summary><FlaskConical size={14}/> 억제제 · 짝풀림제 <ChevronDown size={14}/></summary>
                {(["rotenone", "cyanide", "oligomycin", "dnp"] as const).map(key => <Slider key={key} name={key} params={lab.params} onEdit={changeParam}/>)}
              </details>
              <label className="select-label">세포질 NADH 환원력 셔틀
                <select value={lab.params.shuttle} onChange={e => lab.set({ shuttle: e.target.value as Params["shuttle"] }, "세포질 NADH 셔틀 전환 · " + e.target.selectedOptions[0].text)}>
                  <option value="malate">말산–아스파르트산 (NADH → I)</option>
                  <option value="glycerol">글리세롤 3-인산 (전자 → Q)</option>
                </select>
              </label>
            </section>
            <details className="rail-details">
              <summary><Atom size={14}/> 고급 실험 <ChevronDown size={14}/></summary>
              <p className="note muted">산소 유입을 중단하고 별도의 ATP 저장량을 두어, 기울기가 낮아질 때 ATP 가수분해와 역회전을 관찰합니다.</p>
              <button className="button advanced-button" onClick={advanced}>ATPase 역방향 실험 시작</button>
              {lab.params.reverse && <p className="note mono">ATP {fmt(r.reverseAtp)} · 가수분해 {fmt(r.hydrolysisRate)} / s</p>}
            </details>
            <section className="rail-section current-experiment">
              <div className="section-label"><FlaskConical size={14}/> 현재 조건</div>
              <h3>{lab.label}</h3><p>{lab.params.reverse ? "산소를 소비한 뒤 |Δp|가 전환점 아래로 내려가면 저장 ATP를 사용해 H⁺를 반대 방향으로 이동합니다." : active?.effect ?? (activeEffects(lab.params) || "공급·막 투과성·효소 활성에 따라 플럭스와 기울기가 달라집니다.")}</p>
              {lab.params.fermentation !== "off" && <button className="button" onClick={() => lab.set({ fermentation: "off", oxygen: 1 }, "발효를 종료하고 산소 공급을 재개", "산소 공급 재개")}>발효 종료 · O₂ 공급 재개</button>}
            </section>
            <section className="rail-section inspector">
              <div className="section-label"><Atom size={14}/> {path ? "반응 설명" : "구조 탐색"}</div>
              {!path && (view.scale === "organelle" ? <select aria-label="선택 구조" value={view.anatomy} onChange={e => selectAnatomy(e.target.value as AnatomyId)}>{ANATOMY.map(a => <option key={a.id} value={a.id}>{a.title} · {a.en}</option>)}</select> :
                <select aria-label="선택 단백질" value={view.protein} onChange={e => selectProtein(e.target.value as ProteinId)}>{PROTEINS.map(a => <option key={a.id} value={a.id}>{a.title} · {a.en}</option>)}</select>)}
              <p>{reaction?.action ?? (view.scale === "organelle" ? anatomy.info : protein.info)}</p>
              {!path && <details><summary>상세 설명</summary><p>{view.scale === "organelle" ? anatomy.detail : protein.detail}</p></details>}
              {!path && view.scale === "membrane" && <button className="button" onClick={() => openScale("molecular")}>선택 단백질 확대 <ArrowRight size={14}/></button>}
              {path && <p className="mono">{reaction?.byproducts}</p>}
            </section>
          </div>}
          {right && <div className="resizer resizer-right" role="separator" aria-label="계측 패널 너비" aria-orientation="vertical" tabIndex={0}
            onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") changeSize("right", document.documentElement.clientWidth - rightWidth + (e.key === "ArrowLeft" ? -10 : 10)); }}
            onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) changeSize("right", e.clientX); }}/>}
        </aside>
      </div>
      <footer className="statusbar"><span><i/> {lab.label}</span><span>계산 간격 1/120 s <b>·</b> 관측값 5 Hz</span><button onClick={() => setModal("model")}>가상 실험 · 모형 단위 <CircleHelp size={13}/></button></footer>
    </div>
    {modal === "model" && <ModelInfo close={() => setModal(undefined)}/>}
    {modal === "report" && <Report lab={lab} baseline={comparing ? baseline : undefined} close={() => setModal(undefined)}/>}
  </>;
}

createRoot(document.getElementById("root")!).render(<App/>);

