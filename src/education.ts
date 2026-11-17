export const PROTEINS = [
  { id: "I", title: "복합체 I", en: "NADH dehydrogenase", color: "#67c8ff", info: "NADH를 NAD⁺로 산화하고 전자쌍을 Q에 전달한다.", detail: "전자쌍당 H⁺ 4개를 바탕질에서 막사이공간으로 옮긴다. 로테논은 이 진입 경로를 억제한다." },
  { id: "II", title: "복합체 II", en: "Succinate dehydrogenase", color: "#b294fd", info: "숙신산을 푸마르산으로 산화하면서 효소 결합 FAD를 환원한다.", detail: "전자가 Q로 이동한다. 복합체 II의 직접적인 양성자 펌핑은 0이다. FADH₂ 표시는 이 효소 결합 환원 상태의 요약이다." },
  { id: "Q", title: "유비퀴논", en: "Coenzyme Q", color: "#5aebd2", info: "내막 지질층을 오가는 전자 운반체다.", detail: "I·II 등의 전자쌍을 QH₂ 형태로 받아 III에 전달한다. 글리세롤 3-인산 셔틀도 전자를 Q에 공급한다." },
  { id: "III", title: "복합체 III", en: "Cytochrome bc₁", color: "#f285cc", info: "QH₂의 전자를 시토크롬 c에 전달한다.", detail: "Q 회로의 순효과로 전자쌍당 H⁺ 4개가 막사이공간 쪽에 나타난다. 시토크롬 c는 전자를 한 개씩 받는다." },
  { id: "c", title: "시토크롬 c", en: "Cytochrome c", color: "#5aebd2", info: "막사이공간 쪽에서 III와 IV 사이를 연결한다.", detail: "헴을 포함한 작은 가용성 단백질이다. 이동하는 점은 전자 전달 경로의 표상이다." },
  { id: "IV", title: "복합체 IV", en: "Cytochrome c oxidase", color: "#ff936e", info: "O₂가 최종 전자수용체로 작용해 물이 된다.", detail: "전자쌍당 O₂ ½분자를 소비하고 H₂O 1분자를 만든다. 전자쌍당 H⁺ 2개를 펌핑하며 물 생성에 쓰이는 바탕질 H⁺는 별도로 소비된다." },
  { id: "ATP", title: "ATP 합성효소", en: "F₀F₁ ATP synthase", color: "#ffd285", info: "H⁺ 흐름이 F₀ 로터를 돌리고 F₁이 ATP를 합성한다.", detail: "스테이터는 촉매 머리를 잡아준다. 효소 회전은 H⁺ 통과율에서 계산하며 ATP 생성량은 ADP·Pi·구동력에 의해 제한된다." },
] as const;

export type ProteinId = typeof PROTEINS[number]["id"];
export type Path = "glycolysis" | "pdh" | "tca" | "lactate" | "alcohol";
export type Scale = "organelle" | "membrane" | "molecular";

interface Lesson {
  title: string; en: string; summary: string; detail: string; question: string; answer: string;
  scale: Scale; protein?: ProteinId; path?: Path; experiment: string;
}
export const LESSONS: Lesson[] = [
  { title: "마이토콘드리아 구조", en: "Mitochondrial anatomy", summary: "이중막 중 내막이 크리스타를 이루며 바탕질을 둘러싼다.", detail: "크리스타 내부 공간은 막사이공간과 연결된다. 내막이 H⁺ 이동을 제한하기 때문에 양쪽에 전기화학적 차이가 생긴다.", question: "양성자 구동력이 형성되는 막은 어디인가요?", answer: "전자전달계와 ATP 합성효소가 위치하는 내막이다.", scale: "organelle", experiment: "A" },
  { title: "세포호흡 전체 개요", en: "Respiration overview", summary: "포도당 산화에서 나온 전자가 NADH 등을 거쳐 O₂에 전달된다.", detail: "해당 과정은 세포질, 피루브산 산화와 TCA는 바탕질, 전자전달계와 ATP 합성효소는 내막에서 작동한다. 셔틀이 세포질 NADH의 환원력을 전달한다.", question: "세포질 NADH가 내막을 직접 통과하나요?", answer: "셔틀이 전자 또는 환원력을 전달한다. NADH 분자는 세포질에 남는다.", scale: "organelle", experiment: "A" },
  { title: "해당 과정", en: "Glycolysis", summary: "세포질에서 포도당 1개가 피루브산 2개로 나뉜다.", detail: "ATP 2개를 투자하고 4개를 회수해 순 ATP 2개를 만든다. NAD⁺ 2개가 환원돼 NADH 2개가 생긴다.", question: "ATP 회수량과 순생성량은 각각 얼마인가요?", answer: "회수량 4개에서 투자량 2개를 빼면 순생성 2개다.", scale: "organelle", path: "glycolysis", experiment: "F" },
  { title: "피루브산 산화", en: "Pyruvate oxidation", summary: "3탄소 피루브산에서 CO₂가 떨어지고 2탄소 아세틸기가 CoA와 결합한다.", detail: "피루브산 탈수소효소 복합체가 촉매하며, 피루브산 1개당 NADH 1개를 생성한다.", question: "CO₂의 탄소는 어느 분자에서 왔나요?", answer: "피루브산의 카복실기에서 왔다.", scale: "organelle", path: "pdh", experiment: "A" },
  { title: "TCA 회로", en: "Citric acid cycle", summary: "아세틸기가 옥살아세트산과 결합하고, 산화 과정에서 환원당량을 얻는다.", detail: "아세틸-CoA당 NADH 3, FAD 환원 1, ATP/GTP 1, CO₂ 2가 순생성된다. 첫 회전에서 갓 들어온 두 탄소가 바로 방출된다고 볼 수 없다.", question: "회로가 계속되는 데 필요한 재생 물질은 무엇인가요?", answer: "아세틸기와 결합할 4탄소 옥살아세트산이 재생된다.", scale: "organelle", path: "tca", experiment: "A" },
  { title: "NADH와 FADH₂", en: "Redox carriers", summary: "전자는 각각 복합체 I과 Q로 이어지는 경로에 들어간다.", detail: "NAD⁺/NADH는 반응 사이를 오간다. 복합체 II의 FAD는 효소에 결합하며, 여기서는 환원 상태를 풀로 묶어 계산한다.", question: "복합체 I만 차단하면 전자전달 전체가 멈추나요?", answer: "복합체 II 등을 통해 Q가 환원되면 III와 IV로 전자가 흐를 수 있다.", scale: "membrane", protein: "II", experiment: "B" },
  { title: "전자전달계", en: "Electron transport chain", summary: "전자쌍이 I 또는 II에서 Q를 거쳐 III, 시토크롬 c, IV로 전달된다.", detail: "전자전달 속도는 기질, O₂, 복합체 활성 및 기존 기울기에 의해 제한된다. IV에서 O₂가 환원된다.", question: "산소 공급을 끊었을 때 펌핑이 왜 점진적으로 줄어드나요?", answer: "공급을 끊어도 남아 있는 O₂가 소비되는 동안 전자전달이 이어진다.", scale: "membrane", protein: "IV", experiment: "F" },
  { title: "양성자 펌핑", en: "Proton translocation", summary: "복합체 I, III, IV가 바탕질에서 막사이공간 방향으로 H⁺를 이동시킨다.", detail: "교육 모형은 전자쌍당 I·III·IV에서 각각 4·4·2 H⁺를 사용한다. II 경로의 전체 펌핑은 6 H⁺다.", question: "복합체 II는 H⁺를 몇 개 펌핑하나요?", answer: "직접 펌핑은 0개다.", scale: "membrane", protein: "I", experiment: "B" },
  { title: "화학삼투", en: "Chemiosmosis", summary: "H⁺가 전기화학적 기울기에 따라 바탕질로 돌아온다.", detail: "바탕질은 상대적으로 음전하이고 pH가 높다. 막전위와 pH 차이가 함께 H⁺의 복귀를 구동한다.", question: "pH 차이가 작아도 H⁺ 흐름이 가능한가요?", answer: "가능하다. 막전위도 양성자 구동력에 기여한다.", scale: "membrane", protein: "ATP", experiment: "E" },
  { title: "ATP 합성효소", en: "ATP synthase", summary: "F₀를 통과하는 양성자가 회전자를 돌려 F₁의 촉매 상태를 바꾼다.", detail: "ADP와 Pi가 필요하다. 스테이터가 촉매 머리를 고정해 회전축과 상대 운동이 생긴다. 역회전과 ATP 가수분해는 상세 모형 설명에서 다룬다.", question: "올리고마이신은 어느 부분의 H⁺ 흐름을 막나요?", answer: "내막에 있는 F₀ 영역이다.", scale: "molecular", protein: "ATP", experiment: "D" },
  { title: "산화적 인산화", en: "Oxidative phosphorylation", summary: "전자 운반체 산화와 ATP 합성이 내막의 양성자 구동력을 통해 연결된다.", detail: "포도당당 30–32 ATP는 셔틀과 근사 수율을 적용한 전체 세포호흡 수지의 예다. 이 모형은 시간에 따라 공급이 변하는 열린 계를 계산한다.", question: "산소 소비가 같은 두 조건에서 ATP 생성률도 같을까요?", answer: "누출이나 ADP 공급이 다르면 ATP 생성률이 달라질 수 있다.", scale: "membrane", protein: "ATP", experiment: "A" },
  { title: "세포호흡 억제제", en: "Respiratory inhibitors", summary: "억제제가 차단하는 위치에 따라 NADH, O₂ 소비, 기울기가 다르게 변한다.", detail: "로테논은 I, 시안화물은 IV, 올리고마이신은 ATP 합성효소의 H⁺ 통로를 막는다. 세 지점을 비교한다.", question: "ATP 합성효소 억제 직후 기울기가 오를 수 있는 이유는?", answer: "H⁺가 일시적으로 펌핑되면서 되돌아오는 경로가 줄기 때문이다.", scale: "membrane", protein: "IV", experiment: "C" },
  { title: "짝풀림", en: "Uncoupling", summary: "H⁺가 합성효소를 우회하면 호흡과 ATP 생산의 결합이 약해진다.", detail: "DNP 프리셋에서 누출이 증가해 구동력이 줄어든다. 역압이 풀려 O₂ 소비가 늘 수 있지만 O₂·기질·복합체 처리량이 상한을 정한다.", question: "짝풀림에서 왜 열 지표는 올라가나요?", answer: "기울기에 담긴 자유에너지가 ATP 합성에 쓰이지 않고 막 누출을 통해 소산된다.", scale: "membrane", protein: "ATP", experiment: "E" },
  { title: "산소호흡과 발효", en: "Respiration and fermentation", summary: "세포질의 발효가 NAD⁺를 재생해 해당 과정이 계속되도록 한다.", detail: "젖산 경로는 피루브산을 환원한다. 알코올 경로는 탈탄산 후 아세트알데하이드를 환원한다. 발효 반응 단계의 추가 ATP는 0이다.", question: "발효 조건에서 ATP가 생기는 곳은 어디인가요?", answer: "세포질의 해당 과정에서 기질수준 인산화로 생긴다.", scale: "organelle", path: "lactate", experiment: "F" },
  { title: "종합 실험", en: "Comparative experiment", summary: "같은 초기 상태에서 정상 조건과 조작 조건을 비교한다.", detail: "한 변인을 바꾸고 같은 시각의 ATP 합성률, O₂ 소비, 기울기, 열 지표를 비교한다. 초기 과도 응답과 준정상 상태를 각각 관찰한다.", question: "올리고마이신과 DNP를 구분할 지표는 무엇인가요?", answer: "둘 다 ATP 생산을 줄일 수 있으나 막전위와 양성자 누출의 반응 방향이 다르다.", scale: "membrane", experiment: "E" },
];

export interface Reaction { name: string; carbon: number; copies?: number; action: string; byproducts: string }
export const PATHS: Record<Path, { title: string; en: string; place: string; rate: "glycolysis" | "pdh" | "tca" | "ferment"; stages: Reaction[] }> = {
  glycolysis: { title: "해당 과정", en: "Glycolysis", place: "세포질", rate: "glycolysis", stages: [
    { name: "포도당", carbon: 6, action: "6탄소 포도당이 해당 과정으로 들어간다.", byproducts: "시작 기질" },
    { name: "과당 1,6-이인산", carbon: 6, action: "헥소키네이스 및 PFK-1 단계에서 인산화한다.", byproducts: "ATP 2 투자" },
    { name: "글리세르알데하이드 3-인산", carbon: 3, copies: 2, action: "6탄소 당이 3탄소 중간체 2개로 나뉜다.", byproducts: "3C × 2" },
    { name: "1,3-비스포스포글리세르산", carbon: 3, copies: 2, action: "중간체가 산화되고 NAD⁺가 환원된다.", byproducts: "NADH 2 생성" },
    { name: "피루브산", carbon: 3, copies: 2, action: "포스포글리세르산 키네이스 및 피루브산 키네이스 단계에서 ATP를 생성한다.", byproducts: "ATP 4 회수 · 순 ATP 2" },
  ] },
  pdh: { title: "피루브산 산화", en: "Pyruvate oxidation", place: "바탕질", rate: "pdh", stages: [
    { name: "피루브산", carbon: 3, action: "3탄소 피루브산이 바탕질로 유입된다.", byproducts: "피루브산 1 기준" },
    { name: "아세틸기", carbon: 2, action: "탈탄산과 산화가 이어진다. 탄소 하나가 CO₂로 나온다.", byproducts: "CO₂ 1 · NADH 1" },
    { name: "아세틸-CoA", carbon: 2, action: "CoA에 결합한 아세틸기가 TCA 회로에 공급된다. 표시는 아세틸기의 탄소만 센다.", byproducts: "CoA 결합" },
  ] },
  tca: { title: "TCA 회로", en: "Citric acid cycle", place: "바탕질 · 숙신산 탈수소효소는 내막", rate: "tca", stages: [
    { name: "시트르산", carbon: 6, action: "시트르산 합성효소가 옥살아세트산(4C)과 아세틸기(2C)를 축합한다.", byproducts: "CoA 방출" },
    { name: "아이소시트르산", carbon: 6, action: "아코니테이스가 시트르산의 구조를 재배열한다.", byproducts: "이성질화" },
    { name: "α-케토글루타르산", carbon: 5, action: "아이소시트르산 탈수소효소에서 산화적 탈탄산이 일어난다.", byproducts: "NADH 1 · CO₂ 1" },
    { name: "석시닐-CoA", carbon: 4, action: "α-케토글루타르산 탈수소효소 복합체가 다시 산화적 탈탄산을 일으킨다.", byproducts: "NADH 1 · CO₂ 1" },
    { name: "숙신산", carbon: 4, action: "석시닐-CoA 합성효소가 기질수준 인산화를 일으킨다.", byproducts: "GTP 또는 ATP 1" },
    { name: "푸마르산", carbon: 4, action: "내막의 복합체 II가 숙신산을 산화하고 효소 결합 FAD에서 Q로 전자를 보낸다.", byproducts: "효소 결합 FAD 환원 1" },
    { name: "말산", carbon: 4, action: "푸마레이스가 물을 첨가한다.", byproducts: "수화" },
    { name: "옥살아세트산", carbon: 4, action: "말산 탈수소효소가 말산을 산화해 다음 회전에 필요한 수용체를 재생한다.", byproducts: "NADH 1" },
  ] },
  lactate: { title: "젖산 발효", en: "Lactate fermentation", place: "세포질", rate: "ferment", stages: [
    { name: "포도당", carbon: 6, action: "해당 과정이 진행된다.", byproducts: "해당 과정에서 순 ATP 2" },
    { name: "피루브산", carbon: 3, copies: 2, action: "피루브산이 NADH의 전자를 받는다.", byproducts: "NADH 산화" },
    { name: "젖산", carbon: 3, copies: 2, action: "재생된 세포질 NAD⁺가 해당 과정에 다시 사용된다.", byproducts: "NAD⁺ 재생 · 추가 ATP 0" },
  ] },
  alcohol: { title: "알코올 발효", en: "Alcohol fermentation", place: "효모 등 · 세포질", rate: "ferment", stages: [
    { name: "포도당", carbon: 6, action: "해당 과정에서 포도당을 피루브산 두 개로 전환한다.", byproducts: "해당 과정에서 순 ATP 2" },
    { name: "피루브산", carbon: 3, copies: 2, action: "피루브산 탈탄산효소가 CO₂를 방출한다.", byproducts: "CO₂ 2" },
    { name: "아세트알데하이드", carbon: 2, copies: 2, action: "아세트알데하이드가 NADH의 전자를 받는다.", byproducts: "NADH 산화" },
    { name: "에탄올", carbon: 2, copies: 2, action: "NAD⁺가 재생되어 해당 과정을 지속한다.", byproducts: "NAD⁺ 재생 · 추가 ATP 0" },
  ] },
};

export const ANATOMY = [
  { id: "outer", title: "외막", en: "Outer membrane", info: "마이토콘드리아의 바깥 경계다. 포린이 작은 물질의 이동을 허용한다.", detail: "상대적으로 투과성이 큰 외막과 달리, 내막은 H⁺의 이동을 강하게 제한한다." },
  { id: "inner", title: "내막", en: "Inner membrane", info: "전자전달계와 ATP 합성효소가 자리한 경계다.", detail: "바탕질과 막사이공간을 나눈다. 크리스타는 내막이 안쪽으로 접힌 부분이다." },
  { id: "cristae", title: "크리스타", en: "Cristae", info: "바탕질 방향으로 접혀 들어간 내막이다.", detail: "막 면적을 넓힌다. 접힌 주머니의 안쪽 공간은 내막 주변의 막사이공간과 이어진다." },
  { id: "ims", title: "막사이공간", en: "Intermembrane space", info: "두 막 사이에 있으며 펌핑된 H⁺를 받는다.", detail: "크리스타 내부 공간과 이어진다. 바탕질보다 전위가 높고 pH가 낮은 상태로 표시된다." },
  { id: "matrix", title: "바탕질", en: "Matrix", info: "피루브산 산화와 TCA 회로 대부분이 진행된다.", detail: "ATP 합성효소의 F₁ 촉매 머리는 바탕질 쪽이며, H⁺가 F₀를 거쳐 이쪽으로 돌아온다." },
] as const;
export type AnatomyId = typeof ANATOMY[number]["id"];
