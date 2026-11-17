import { DEFAULTS, DT, initialState, measure, step, type Params, type Reading } from "./model";

export interface Log { time: number; text: string; }
export interface Trial { id: number; label: string; history: Reading[]; params: Params; }
const SAMPLE_STEPS = 24;
const PUBLISH_MS = 90;
const MAX_SAMPLES = 9000;

export class Lab {
  params: Params = { ...DEFAULTS };
  state = initialState();
  reading = measure(this.state, this.params);
  history = [this.reading];
  logs: Log[] = [{ time: 0, text: "정상 세포호흡 · 기준 실험 시작" }];
  trials: Trial[] = [];
  running = true;
  speed = 1;
  label = "정상 세포호흡";
  version = 0;
  epoch = 0;
  ticks = 0;
  private elapsed = 0;
  private publishedAt = 0;
  private serial = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  snapshot = () => this.version;
  publish() {
    this.version++;
    this.listeners.forEach(fn => fn());
  }
  record(text: string) {
    this.logs = [{ time: this.state.time, text }, ...this.logs].slice(0, 100);
  }
  advance(seconds: number) {
    if (!this.running) return;
    this.elapsed += Math.min(seconds, 0.15) * this.speed;
    while (this.elapsed >= DT) {
      this.elapsed -= DT;
      this.state = step(this.state, this.params);
      this.ticks++;
      if (this.ticks % SAMPLE_STEPS === 0) {
        this.history.push(measure(this.state, this.params));
        if (this.history.length > MAX_SAMPLES) this.history.shift();
      }
    }
    this.reading = measure(this.state, this.params);
  }
  static play(labs: Lab[]) {
    let last = performance.now();
    let token = 0;
    const frame = (now: number) => {
      for (const lab of labs) {
        lab.advance((now - last) / 1000);
        if (lab.running && now - lab.publishedAt >= PUBLISH_MS) {
          lab.publishedAt = now;
          lab.publish();
        }
      }
      last = now;
      token = requestAnimationFrame(frame);
    };
    token = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(token);
  }
  set(changes: Partial<Params>, message?: string, label?: string) {
    this.params = { ...this.params, ...changes };
    this.reading = measure(this.state, this.params);
    if (label) this.label = label;
    if (message) this.record(message);
    this.publish();
  }
  reset(params = this.params, label = this.label) {
    this.params = { ...params };
    this.state = initialState();
    this.reading = measure(this.state, this.params);
    this.history = [this.reading];
    this.elapsed = 0;
    this.ticks = 0;
    this.epoch++;
    this.label = label;
    this.logs = [{ time: 0, text: label + " · 초기 조건에서 시작" }];
    this.publish();
  }
  toggle() {
    this.running = !this.running;
    this.record(this.running ? "시뮬레이션 재개" : "시뮬레이션 일시정지");
    this.publish();
  }
  save() {
    this.trials = [...this.trials, {
      id: ++this.serial, label: this.label,
      history: [...this.history.filter(point => point.time < this.reading.time), this.reading],
      params: { ...this.params },
    }];
    this.record(this.label + " · 비교 기록 저장");
    this.publish();
  }
  clear() {
    this.history = [this.reading];
    this.trials = [];
    this.record("그래프 및 비교 기록 지우기");
    this.publish();
  }
}
