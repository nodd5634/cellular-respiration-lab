# Cellular Respiration Lab

한국어 3D 가상 실험실. 마이토콘드리아, 전자전달, 화학삼투와 ATP 합성을 관찰하고, 공급 조건과 효소 활성을 바꿔 같은 시각의 지표를 비교할 수 있다.

## 바로 실행

[실행용 HTML](downloads/Cellular%20Respiration%20Lab.html) · [소스 ZIP](downloads/Cellular%20Respiration%20Lab%20-%20source.zip)

배포본 **Cellular Respiration Lab.html**을 Chrome 또는 Edge에서 연다. WebGL2가 활성화된 브라우저가 필요하다. HTML에 스크립트, 스타일, 글꼴과 3D 장면을 포함하므로 실행 중 인터넷이나 개발 서버가 필요 없다.

## 소스에서 실행

Node.js 22.12 이상 또는 20.19 이상과 npm을 사용한다. Windows PowerShell에서 압축을 푼 프로젝트 폴더로 이동한다.

    npm ci
    npm run dev

터미널에 표시된 로컬 주소를 브라우저로 연다.

    npm test
    npm run build

빌드 결과는 **dist/index.html**이다. 파일을 브라우저에서 직접 열 수 있다.

## 실험 방법

| 작업 | 위치와 조작 |
|---|---|
| 구조 관찰 | 소기관 → 내막 → 분자. 드래그 회전, 휠 확대, 우클릭 드래그 이동. 단면 상태·각도·위치·외막 불투명도는 도구 모음과 설정에서 조작한다. |
| 실시간 조건 변경 | 좌측의 A–F 실험은 현재 상태에 조건을 적용하므로 개입 전후 변화를 볼 수 있다. 초기화하면 같은 설정으로 초기 저장량과 시간 0을 복원한다. |
| 조건 비교 | **실험 비교**에서 현재 조건과 정상 기준이 같은 저장량으로 시작한다. 먼저 정상 조건을 선택한 경우 오른쪽에서 짝풀림을 실행한다. 비교 화면에서 프리셋을 다시 선택하면 두 조건을 함께 초기화한다. |
| 발효 | 좌측 경로에서 젖산 또는 알코올 발효를 선택하면 세포질 화면과 산소 공급 중단 조건이 열린다. 남아 있던 산소와 기울기는 시간이 지나며 감소한다. |
| ATPase 역회전 | 계측 패널에서 **고급 실험 → ATPase 역방향 실험 시작**을 선택한다. 잔류 산소를 소비한 뒤 로터가 역회전하고 별도 ATP 저장량이 줄어든다. |
| 실험 분석 | 6개 그래프에서 커서를 움직여 시각별 값을 읽고, 시간축과 표시 구간을 바꾼다. 기록 탭에서 현 실험을 보관하고 다른 조건과 겹쳐 볼 수 있다. PNG와 CSV를 저장할 수 있다. |
| 보고서 | 보고서에서 목적·가설·변인·결과 등 11개 항목을 작성한다. 최신 데이터와 그래프를 첨부하고 **인쇄 / PDF**를 누른 뒤 브라우저 인쇄 대상에서 PDF 저장을 선택한다. |
| 학습 | 15개 단계의 요약, 상세 설명, 확인 질문, 관련 실험과 경로를 둘러본다. TCA는 8개 반응을 개별 선택할 수 있다. |

## 학교 발표

1. 정상 상태와 산소 공급 중단을 비교한다. 남아 있는 O₂가 소모되면서 펌핑과 ATP 합성이 시차를 두고 감소하는 이유를 설명한다.
2. 올리고마이신과 짝풀림을 비교한다. 둘 다 산화적 ATP 생성을 줄일 수 있다. 올리고마이신은 합성효소의 H⁺ 복귀를 막아 기울기를 높이고, 짝풀림은 H⁺ 우회를 늘려 기울기를 낮춘다.
3. 로테논 조건에서 I과 II의 전자쌍 전달률을 각각 읽는다. 복합체 II에는 직접적인 H⁺ 펌핑이 없다.
4. 발효 실험에서 세포질 NAD⁺의 재생과 해당 과정의 ATP 생성을 연결한다. 해당 과정의 순 생성량은 포도당당 ATP 2개다.

## 구조와 검증

- React, TypeScript, Vite, Three.js, WebGL2, GLSL, SVG, Vitest.
- src/model.ts는 반응·풀·플럭스를 계산한다. src/lab.ts는 1/120초 고정 시간 스텝, 데이터 표본과 실험 기록을 관리한다.
- src/scene.ts는 계산 상태를 읽어서 절차적 막, 단백질, 입자와 로터를 구동한다. src/analysis.tsx의 그래프는 시뮬레이션 표본을 사용한다.
- 검증은 정상 호흡, 산소 고갈, 기질 제한, 가상 억제제·짝풀림, 셔틀, 발효, 역방향, 질량수지, 동일 초기 조건 및 장시간 수치 안정성을 포함한다.
- 그래프 자료는 5 Hz로 최대 30분 분량을 메모리에 둔다. 현재 탭에서 저장한 실험 기록과 첨부 상태는 탭을 닫으면 사라진다. 보고서 텍스트는 브라우저 로컬 저장소를 사용할 수 있을 때 보존된다.

## 모델과 한계

농도·양·플럭스는 상대 단위다. 모형 mV와 pH는 유효 양성자 풀에 가정한 전하·완충 계수를 적용한 값이다. 구조는 절차적 교육 모형이며, 탄소 골격과 전자 입자는 반응을 설명하는 표상이다. 세포 유형별 수율과 실제 단백질 구조는 모델 적용 범위를 벗어난다. 상세 식과 부호는 [과학 모델](docs/model.md)에 있다.

## 참고 문헌

- Mitchell, P. (1978). [David Keilin’s Respiratory Chain Concept and Its Chemiosmotic Consequences](https://www.nobelprize.org/uploads/2018/06/mitchell-lecture.pdf).
- Brand, M. D. et al. (1993). [Control of the effective P/O ratio of oxidative phosphorylation in liver mitochondria and hepatocytes](https://pmc.ncbi.nlm.nih.gov/articles/PMC1132431/).
- Noji, H. et al. (1997). [Direct observation of the rotation of F₁-ATPase](https://www.nature.com/articles/386299a0).
- Gnaiger, E. (2009). [Functional Assessment of Isolated Mitochondria In Vitro](https://pmc.ncbi.nlm.nih.gov/articles/PMC2782617/).

### 브라우저 스모크 테스트

Playwright CLI가 설치돼 있으면 개발 서버를 연 상태에서 아래 명령으로 UI 시나리오를 재현할 수 있다.

    playwright-cli -s=respiration-lab open --browser=chrome http://127.0.0.1:5173/
    playwright-cli -s=respiration-lab run-code --filename=tests/browser-smoke.js
    playwright-cli -s=respiration-lab close

브라우저 테스트는 별도 세션에서 시험용 보고서 초안을 작성하고 CSV와 PNG를 내려받는다. 서버가 다른 포트를 사용하면 명령의 주소를 바꾼다. 번들에 포함한 외부 라이브러리와 글꼴의 라이선스는 HTML의 third-party-notices 영역에 있다.
