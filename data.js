// ============================================================
// data.js  (Gemini API 연동 버전)
//
// sketch.js는 그대로 둔 채 이 파일만 교체해서 동작하도록 설계했습니다.
// 핵심 트릭: sketch.js는
//     currentData = fetchRegionData(region.id);
//   처럼 "동기 함수"로 호출합니다. 그래서 fetchRegionData()는
//     1) 즉시 "불러오는 중" 표시용 더미 객체를 반환 (화면이 안 멈추도록)
//     2) 백그라운드에서 Gemini API를 호출하고
//     3) 응답이 오면 sketch.js가 들고 있는 전역 currentData를
//        "직접" 덮어써서 다음 프레임부터 실제 데이터가 보이게 합니다.
//   p5.js의 draw()는 매 프레임 돌기 때문에 currentData가 나중에
//   바뀌어도 화면에 자연스럽게 반영됩니다.
// ============================================================

// 13개 지역 정의: id, 화면 표시명, 반경
// 실제 좌표(x, y)는 map_data.js 의 REGION_GEO_COORDS (실제 위경도 투영값)에서 가져옵니다.
const REGION_META = [
  { id: "seoul",      name: "서울",        r: 11 },
  { id: "incheon_gw",  name: "인천/경기서부", r: 10 },
  { id: "gyeonggi_e",  name: "경기동부",     r: 9 },
  { id: "gyeonggi_s",  name: "경기남부",     r: 9 },
  { id: "gyeonggi_n",  name: "경기북부",     r: 9 },
  { id: "sejong",      name: "세종",        r: 7 },
  { id: "busan",       name: "부산",        r: 10 },
  { id: "daegu_gb",    name: "대구/경북",    r: 11 },
  { id: "gwangju_jn",  name: "광주/전남",    r: 11 },
  { id: "daejeon_cn",  name: "대전/충남",    r: 10 },
  { id: "ulsan",       name: "울산",        r: 7 },
  { id: "gangwon",     name: "강원",        r: 11 },
  { id: "chungbuk",    name: "충북",        r: 9 },
];

// map_data.js (REGION_GEO_COORDS) 의 실제 투영 좌표와 합쳐서 REGIONS 생성
const REGIONS = REGION_META.map((m) => {
  const coord = REGION_GEO_COORDS[m.id];
  return { ...m, x: coord[0], y: coord[1] };
});

// 기사 분류 카테고리 (요구사항 3번)
const CATEGORIES = ["사건/사고", "재판/수사", "행정", "정치", "문화", "기타"];

// 통신사 3사 (요구사항 핵심: 3대 통신사 보도 종합)
const WIRE_SERVICES = ["연합뉴스", "뉴시스", "뉴스1"];

// ------------------------------------------------------------
// 13개 지역별 지방지/통신사 + 행정가(광역단체장) 매핑
// 광역단체장은 2026.6.3 제9회 전국동시지방선거(민선 9기) 확정 결과 기준.
// ------------------------------------------------------------
// keywords: 실제 기사가 이 지역을 부르는 진짜 이름들(시·군 단위까지). 대시보드가 만든
// "경기북부/동부/남부", "대구/경북" 같은 합성·세분화 라벨은 기사 본문에 그대로 등장하는
// 일이 거의 없어서, region.name만으로 관련성을 판단시키면 분류에 실패한다 (실제로
// 대구·경기북부·경기동부에서 확인된 버그). 경기도 4분할은 경기도 제2청사 관할 10개
// 시군을 "경기북부"로 보고, 나머지 21개 시·군을 동부/남부/서부로 나눈 것이다.
const REGION_PRESS_MAP = {
  seoul:       { localPress: ["서울신문"], head: { name: "오세훈", title: "서울특별시장" }, keywords: ["서울"] },
  incheon_gw:  { localPress: ["경인일보", "인천일보"], head: { name: "박찬대", title: "인천광역시장" }, keywords: ["인천", "김포", "부천", "광명"] },
  gyeonggi_e:  { localPress: ["경기일보", "중부일보"], head: { name: "추미애", title: "경기도지사" }, keywords: ["성남", "용인", "이천", "광주", "하남", "여주", "양평"] },
  gyeonggi_s:  { localPress: ["경기일보", "중부일보"], head: { name: "추미애", title: "경기도지사" }, keywords: ["수원", "안양", "안산", "평택", "화성", "오산", "군포", "의왕", "시흥", "과천", "안성"] },
  gyeonggi_n:  { localPress: ["경기일보", "중부일보"], head: { name: "추미애", title: "경기도지사" }, keywords: ["고양", "구리", "남양주", "동두천", "양주", "포천", "연천", "가평", "의정부", "파주"] },
  sejong:      { localPress: ["대전일보", "중도일보", "충청투데이"], head: { name: "조상호", title: "세종특별자치시장" }, keywords: ["세종"] },
  busan:       { localPress: ["부산일보", "국제신문"], head: { name: "전재수", title: "부산광역시장" }, keywords: ["부산"] },
  daegu_gb:    { localPress: ["매일신문", "영남일보", "경북일보", "대구일보"], head: { name: "추경호", title: "대구광역시장" }, secondHead: { name: "이철우", title: "경상북도지사" }, keywords: ["대구", "경북", "경상북도", "포항", "구미", "경주", "안동", "영주", "김천", "상주", "문경", "영천", "경산", "칠곡", "고령", "성주", "예천", "봉화", "울진", "영덕", "의성", "청송", "영양", "군위", "청도"] },
  gwangju_jn:  { localPress: ["광주일보", "무등일보", "전남일보", "광주매일신문"], head: { name: "민형배", title: "전남광주통합특별시장" }, keywords: ["광주", "전남", "전라남도", "목포", "여수", "순천", "나주", "광양", "담양", "곡성", "구례", "고흥", "보성", "화순", "장흥", "강진", "해남", "영암", "무안", "함평", "영광", "장성", "완도", "진도", "신안"] },
  daejeon_cn:  { localPress: ["대전일보", "중도일보", "충청투데이"], head: { name: "허태정", title: "대전광역시장" }, secondHead: { name: "박수현", title: "충청남도지사" }, keywords: ["대전", "충남", "충청남도", "천안", "아산", "서산", "논산", "공주", "보령", "당진", "금산", "부여", "서천", "청양", "홍성", "예산", "태안", "계룡"] },
  ulsan:       { localPress: ["울산매일", "울산신문", "울산제일일보"], head: { name: "김상욱", title: "울산광역시장" }, keywords: ["울산"] },
  gangwon:     { localPress: ["강원일보", "강원도민일보"], head: { name: "우상호", title: "강원도지사" }, keywords: ["강원", "춘천", "원주", "강릉", "동해", "태백", "속초", "삼척", "홍천", "횡성", "영월", "평창", "정선", "철원", "화천", "양구", "인제", "고성", "양양"] },
  chungbuk:    { localPress: ["동양일보", "충청일보", "충북일보"], head: { name: "신용한", title: "충청북도지사" }, keywords: ["충북", "충청북도", "청주", "충주", "제천", "보은", "옥천", "영동", "증평", "진천", "괴산", "음성", "단양"] },
};

// ------------------------------------------------------------
// Gemini API 설정
// apiKey는 보통 sketch.js의 setup()에서 정의합니다 (예: let apiKey = config.apiKey 또는 prompt(...) 결과).
// 혹시 sketch.js에 아직 추가되지 않았다면, 이 파일이 로드되는 시점에 한 번 prompt로 입력받습니다.
// ------------------------------------------------------------
if (typeof apiKey === "undefined" || !apiKey) {
  var apiKey = (typeof config !== "undefined" && config && config.apiKey)
    ? config.apiKey
    : prompt("Gemini API 키를 입력해주세요.");
}

// 한 모델이 503/429를 내면 그 모델을 계속 기다리지 않고 바로 다음 모델로 넘어간다.
// (목록이 4개뿐이라 5번째 시도는 다시 첫 모델로 돌아간다)
const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.5-flash",
];

function geminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getReviewPeriod() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d) =>
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(yesterday)} ~ ${fmt(now)}`;
}

// [전국 주요 이슈 추적] 프롬프트를 특정 지역 전용으로 좁힌 버전
// → "현안 정리" + "기사 분류" 두 기능을 동시에 산출
function buildIssuePrompt(regionId, period) {
  const r = REGION_PRESS_MAP[regionId];
  const region = REGIONS.find((x) => x.id === regionId);

  return `[지역 이슈 추적 — ${region.name}]
검토 기간: ${period}

---- 방식 ----
아래는 통신사들의 "전국 종합" 최신 기사 목록 페이지다. 이 페이지들을 직접 읽고,
그 안에 실제로 나열된 기사 중에서만 "${region.name}" 관련 기사를 골라낸다.
- 뉴스1 전국종합: https://www.news1.kr/local/latest
- 연합뉴스 전국전체 (1페이지): https://www.yna.co.kr/local/all
- 연합뉴스 전국전체 (2페이지, 더 과거 기사): https://www.yna.co.kr/local/all/2
- 뉴시스 지방최신: https://www.newsis.com/region/list/?cid=10800&scid=10899
- 뉴시스 수도권최신: https://www.newsis.com/metro/list/?cid=14000&scid=14001

판단 기준 (아래 키워드/매체명은 크롤링 대상이 아니라 관련성 판단용일 뿐이다):
- "${region.name}"은 아래 키워드 중 하나라도 제목이나 본문에 나오면 관련 기사로 본다.
  지역명 자체("${region.name}")는 실제 기사에 거의 안 나오니, 그 안의 개별 시·군·구
  이름으로 매칭해야 한다: ${[region.name, ...(r.keywords || [])].join(", ")}
- 이 지역 지방지명이 본문에 언급되면 관련 기사로 본다: ${r.localPress.join(", ")}

엄격한 규칙 (반드시 지킨다):
- 위 페이지들에 실제로 나열되지 않은 기사는 절대 만들어내지 않는다. 짐작·일반 상식으로 채우지 않는다.
- url 필드에는 그 페이지에 실제로 적힌 href를 한 글자도 바꾸지 않고 그대로 적는다.
  매체 홈페이지나 섹션 목록 페이지 주소를 넣지 않는다.
- 어느 페이지에도 "${region.name}" 관련 기사가 없으면 해당 결과는 빈 배열로 둔다. 억지로 채우지 않는다.

위 조건에 맞는 기사로 다음 두 가지를 산출한다.

1. 지역별 현안 정리
   - 해당 지역에서 현재 진행 중인 주요 현안을 2~4건으로 요약한다.
   - 각 현안은 제목 한 줄 + 1~2문장 설명 형태로 작성한다.

2. 기사 분류
   - 골라낸 기사를 다음 6개 카테고리로 분류한다: 사건/사고, 재판/수사, 행정, 정치, 문화, 기타
   - 각 기사는 카테고리, 제목, 1문장 요약, 보도 통신사/매체명, 보도 시각을 포함한다.
   - 카테고리당 1~3건, 해당 사항 없는 카테고리는 생략 가능.

---- 출력 형식 ----
아래 JSON 객체 "하나만" 출력한다. 이 외의 텍스트는 단 한 글자도 출력하지 않는다.
- 페이지를 읽었다는 설명, 근거 설명, 인용, 마크다운 코드블록(\`\`\`) 표시를 절대 붙이지 않는다.
- 첫 글자는 반드시 "{", 마지막 글자는 반드시 "}"여야 한다. 그 앞뒤에 어떤 글자도 없어야 한다.
- 기사 제목에 강조용 인용부호가 들어가더라도, title/summary 같은 문자열 값 안에 큰따옴표(")를
  그대로 쓰면 JSON이 깨진다. 반드시 \\" 로 escape하거나 “ ” 같은 둥근 인용부호로 바꿔 쓴다.

{
  "issues": [
    { "title": "현안 제목", "summary": "1~2문장 설명" }
  ],
  "classifiedArticles": [
    { "category": "사건/사고|재판/수사|행정|정치|문화|기타", "title": "기사 제목", "summary": "1문장 요약", "source": "매체명", "time": "보도 시각", "url": "목록 페이지에 실제로 적힌 그 기사의 href" }
  ]
}`;
}

// [SNS 말말말] 프롬프트를 특정 지역 전용으로 좁힌 버전 → "SNS 브리핑" 기능
function buildSnsPrompt(regionId, period) {
  const r = REGION_PRESS_MAP[regionId];
  const region = REGIONS.find((x) => x.id === regionId);
  const heads = [r.head, r.secondHead].filter(Boolean);
  const headList = heads.map((h) => `- ${h.name} (${h.title})`).join("\n");

  return `[SNS 말말말 모니터링 — ${region.name}]
검토 기간: ${period}
플랫폼: 페이스북, X(트위터)

---- 대상 인물 ----
${headList}

---- 수집 기준 ----
위 인물들의 페이스북·X 공개 게시물을 검색해 발언을 수집한다.
- 지역 현안 관련 정책 발언
- 중앙정부·국회를 향한 요구·논평
- 화제성 발언 (논란, 주목, 확산)
- 단순 행사 인사말·의례적 축하 게시물은 제외

너에게는 google_search 도구로 실시간 웹 검색 권한이 주어져 있다. 학습 데이터의 지식
컷오프 이후 시점이거나 검토 기간이 미래처럼 보이더라도, 그건 검색 도구로 직접 확인하면
되는 사실일 뿐이니 "알 수 없다", "접근할 수 없다"는 이유로 거절하지 말고 반드시 도구를
사용해 검색한 뒤 답하라.

---- 출력 형식 (JSON만 출력, 다른 텍스트 금지) ----
- 문자열 값 안에 큰따옴표(")를 그대로 쓰면 JSON이 깨진다. 인용을 표현해야 하면 반드시
  \\" 로 escape하거나 “ ” 같은 둥근 인용부호를 쓴다.
{
  "official": "${heads[0] ? heads[0].name + ' ' + heads[0].title : ''}",
  "date": "검토 기간 내 가장 최근 게시 날짜 (YYYY-MM-DD)",
  "items": [
    "발언 요약 1 (출처 링크 포함)",
    "발언 요약 2 (출처 링크 포함)",
    "발언 요약 3 (출처 링크 포함)"
  ]
}`;
}

// 로딩 중 번갈아 보여줄 상태 메시지. 실제 프롬프트가 참조하는 매체 목록(통신사 3사 +
// 해당 지역 지방지)과 맞춰서 "지금 진짜 이걸 보고 있다"는 느낌을 준다.
function buildLoadingMessages(regionId) {
  const r = REGION_PRESS_MAP[regionId];
  return [
    "전국 통신사 보도를 검토하고 있어요",
    ...WIRE_SERVICES.map((wire) => `${wire} 보도를 종합해요`),
    ...r.localPress.map((press) => `${press} 보도를 종합해요`),
    "SNS 발언을 모으고 있어요",
  ];
}

// 모델이 ```json 코드블록을 붙이거나(지시를 어기고) 앞뒤에 설명을 덧붙이는 경우까지
// 대비한 안전한 JSON 파서. url_context처럼 모델이 긴 페이지를 읽고 나면 "근거를
// 설명하려는" 부가 텍스트를 붙이는 일이 늘어나서, 그런 경우에도 JSON 본문만 살려낸다.
function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (e2) {
        // 중괄호로 잘라내도 못 살리면 그냥 실패 처리
      }
    }
    console.warn("JSON 파싱 실패, 원문:", cleaned);
    return null;
  }
}

// 503(UNAVAILABLE)/429(RATE_LIMIT)는 그 모델의 일시적 과부하/쿼터 초과라, 같은 모델을
// 백오프하며 기다리는 대신 바로 다음 모델로 넘어가며 최대 5번 시도한다.
// (https://github.com/google-gemini/gemini-cli/issues/8475)
async function callGemini(systemPrompt, tools, maxAttempts = 5) {
  let lastError = new Error("Gemini API 호출 실패");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const model = GEMINI_MODEL_FALLBACKS[attempt % GEMINI_MODEL_FALLBACKS.length];

    let response;
    try {
      response = await fetch(geminiUrl(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        // url_context는 본문(contents)에 실제로 적힌 URL만 인식하고 system_instruction
        // 안의 URL은 보지 않는다. 그래서 프롬프트(URL 포함)를 system_instruction이 아니라
        // user 메시지 본문으로 보낸다.
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          // 호출부가 그라운딩 방식을 직접 고른다 (실제 페이지를 읽는 url_context 또는
          // 검색 스니펫 기반 google_search). 이게 없으면 모델이 기사 제목/링크를 지어낸다.
          tools,
        }),
      });
    } catch (networkErr) {
      lastError = networkErr;
      response = null;
    }

    if (response && response.ok) {
      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const urlContextMetadata = candidate?.urlContextMetadata;
      const urlMeta = urlContextMetadata?.urlMetadata;
      const requestedUrlContext = Array.isArray(tools) && tools.some((t) => t && "url_context" in t);
      const result = { text: parts.map((p) => p.text || "").join(""), urlContextMetadata };

      if (urlMeta && urlMeta.length > 0) {
        console.info(
          "url_context 조회 결과:",
          urlMeta.map((m) => `${m.retrievedUrl} → ${m.urlRetrievalStatus}`).join(" | ")
        );
      }

      // 이 앱의 모든 프롬프트는 "JSON 객체 하나만 출력"을 엄격한 규칙으로 못박아 둔다.
      // 그런데도 모델이 (a) url_context를 요청했는데 호출하지 않거나, (b) JSON이 아닌
      // 텍스트로 답하는 경우가 있다 — 예: 제목 안의 인용부호(")를 \"로 escape하지 않아
      // JSON이 깨지는 경우, "2026년은 미래라 실시간 정보를 알 수 없다"는 식의 거절 응답 등.
      // 둘 다 HTTP 200으로 "성공"하지만 호출부가 쓸 수 없는 응답이므로, 429/503과 똑같이
      // 다음 모델로 바꿔 재시도한다. 그대로 받아들이면 기사 분류/SNS 브리핑이 늘 빈 결과나
      // "JSON 파싱 실패"로 끝난다.
      const noToolCall = requestedUrlContext && !(urlMeta && urlMeta.length > 0);
      const notJson = !safeParseJson(result.text);

      if (noToolCall || notJson) {
        if (attempt < maxAttempts - 1) {
          const reason = noToolCall ? "url_context 미호출" : "JSON이 아닌 응답";
          const nextModel = GEMINI_MODEL_FALLBACKS[(attempt + 1) % GEMINI_MODEL_FALLBACKS.length];
          console.warn(`${reason}(${model}) — ${nextModel} 모델로 바꿔 ${attempt + 2}/${maxAttempts}번째 시도`);
          continue;
        }
      }

      return result;
    }

    const status = response ? response.status : null;
    // 에러 응답 본문엔 어떤 쿼터(분당/일일/모델별)가 초과됐는지 등 실제 원인이 들어있다.
    let detail = "";
    let retryDelaySec = NaN;
    if (response) {
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || "";
        // Gemini API는 Retry-After 헤더를 보내지 않는다. 실제로 얼마나 기다려야 하는지는
        // error.details의 RetryInfo(retryDelay, 예: "44s") 또는 메시지 안의
        // "Please retry in 44.9s" 문구에만 들어있다. 이걸 안 읽으면 항상 고정
        // 1.2초만 기다리고 다음 모델로 넘어가는데, 쿼터는 그 안에 절대 안 풀려서
        // 5번 시도가 전부 똑같이 즉시 429로 실패한다.
        const retryInfo = errBody?.error?.details?.find((d) => d.retryDelay);
        if (retryInfo) {
          retryDelaySec = parseFloat(retryInfo.retryDelay);
        } else {
          const match = detail.match(/retry in ([\d.]+)\s*s/i);
          if (match) retryDelaySec = parseFloat(match[1]);
        }
      } catch (e) {
        // 본문이 JSON이 아니면 무시
      }
      lastError = new Error(`HTTP error! status: ${status}${detail ? ` — ${detail}` : ""}`);
    }

    const isRetryable = response === null || status === 503 || status === 429;
    if (!isRetryable || attempt === maxAttempts - 1) {
      throw lastError;
    }

    const nextModel = GEMINI_MODEL_FALLBACKS[(attempt + 1) % GEMINI_MODEL_FALLBACKS.length];
    const waitMs = Number.isFinite(retryDelaySec) && retryDelaySec > 0 ? retryDelaySec * 1000 + 250 : 1200;
    console.warn(
      `Gemini API(${model}) ${status ?? "네트워크 오류"} — ${nextModel} 모델로 바꿔 ${attempt + 2}/${maxAttempts}번째 시도${detail ? `\n  └ ${detail}` : ""}`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError;
}

// 무료 티어 RPM(분당 요청 수) 한도는 보통 10~15회 정도라, 지역 클릭 한 번에 2건씩
// 동시에 나가고 여러 지역을 연속 클릭하면 금방 429가 난다. 그래서 모든 Gemini 호출을
// 하나의 줄로 직렬화하고 최소 간격을 둬서 애초에 한도를 넘기지 않게 한다.
const MIN_GEMINI_GAP_MS = 4500; // 분당 약 13건 페이스
let geminiQueueTail = Promise.resolve();
let lastGeminiCallAt = 0;

function enqueueGemini(systemPrompt, tools) {
  const run = geminiQueueTail.then(async () => {
    const wait = lastGeminiCallAt + MIN_GEMINI_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGeminiCallAt = Date.now();
    return callGemini(systemPrompt, tools);
  });
  // 이번 호출이 실패해도 줄 자체는 끊기지 않도록 별도로 이어간다.
  geminiQueueTail = run.catch(() => {});
  return run;
}

// 같은 지역을 다시 클릭했을 때 API를 또 부르지 않도록 잠깐 캐시해둔다.
// (검토 기간이 24시간 단위라 몇 분 안에 다시 봐도 결과가 달라질 일이 없다)
const CACHE_TTL_MS = 5 * 60 * 1000;
const regionDataCache = new Map();

// ------------------------------------------------------------
// 메인 함수: sketch.js가 동기 함수처럼 호출합니다.
//   currentData = fetchRegionData(region.id);
// ------------------------------------------------------------
function fetchRegionData(regionId) {
  const region = REGIONS.find((r) => r.id === regionId);

  const cached = regionDataCache.get(regionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1) 즉시 반환할 "불러오는 중" 상태 (화면이 멈추지 않도록 임시 데이터)
  const loadingPlaceholder = {
    regionId,
    regionName: region.name,
    isLoading: true,
    loadingMessages: buildLoadingMessages(regionId),
    loadingStartedAt: Date.now(),
    briefing: { official: "불러오는 중...", date: "", items: [] },
    issues: [],
    classifiedArticles: [],
  };

  const period = getReviewPeriod();

  // 2) 큐를 통해 두 API를 순서대로(간격을 두고) 호출 후, 완료되면 전역 currentData를 직접 갱신
  Promise.all([
    enqueueGemini(buildIssuePrompt(regionId, period), [{ url_context: {} }]),
    enqueueGemini(buildSnsPrompt(regionId, period), [{ google_search: {} }]),
  ])
    .then(([issueResult, snsResult]) => {
      const issueData = safeParseJson(issueResult.text);
      const snsData = safeParseJson(snsResult.text);

      // url_context로 읽으려 한 출처 페이지를 전부 못 읽었는지(가설 B), 아니면 도구
      // 자체를 호출하지 않았는지(가설 C — 모델이 그냥 답함)를 구분한다.
      const urlMeta = issueResult.urlContextMetadata?.urlMetadata || [];
      const noToolCall = urlMeta.length === 0;
      const allSourcesFailed =
        urlMeta.length > 0 && urlMeta.every((m) => m.urlRetrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS");

      let issuesOut;
      let classifiedArticlesOut;
      let classifyEmptyNote = null;

      if (noToolCall) {
        const reason = "모델이 출처 페이지를 읽지 않고 답했습니다. (콘솔에 'url_context를 요청했지만...' 경고 확인)";
        issuesOut = [reason];
        classifiedArticlesOut = [];
        classifyEmptyNote = reason;
      } else if (allSourcesFailed) {
        const reason = "통신사 출처 페이지를 하나도 읽어오지 못했습니다. (콘솔의 'url_context 조회 결과' 로그 확인)";
        issuesOut = [reason];
        classifiedArticlesOut = [];
        classifyEmptyNote = reason;
      } else if (!issueData) {
        const reason = "현안/기사 데이터 형식이 깨져서 읽지 못했습니다. (콘솔의 'JSON 파싱 실패' 로그 확인)";
        issuesOut = [reason];
        classifiedArticlesOut = [];
        classifyEmptyNote = reason;
      } else {
        issuesOut = Array.isArray(issueData.issues) && issueData.issues.length > 0
          ? issueData.issues.map((i) => `${i.title} — ${i.summary}`)
          : ["현안 데이터를 가져오지 못했습니다."];
        classifiedArticlesOut = Array.isArray(issueData.classifiedArticles) ? issueData.classifiedArticles : [];
        if (classifiedArticlesOut.length === 0) {
          classifyEmptyNote = "관련 기사를 찾지 못했습니다.";
          // JSON 파싱은 됐지만 결과가 빈 배열인 경우 — 모델이 왜 못 찾았다고 판단했는지
          // 원문을 남겨서 "진짜로 없었다" vs "본문을 제대로 못 읽었다"를 구분할 수 있게 한다.
          console.info(`[${region.name}] classifiedArticles가 빈 배열로 옴. 원문:`, issueResult.text);
        }
      }

      // snsData가 JSON 파싱은 됐어도 items가 배열이 아니면(필드 누락, 모델이 문자열/객체로
      // 잘못 채움 등) drawBriefingTab의 for...of가 "is not iterable"로 죽으므로 여기서 검증한다.
      const briefingOut = snsData && Array.isArray(snsData.items)
        ? snsData
        : { official: snsData?.official || "", date: snsData?.date || "", items: ["SNS 데이터를 가져오지 못했습니다."] };

      const finalData = {
        regionId,
        regionName: region.name,
        isLoading: false,
        briefing: briefingOut,
        issues: issuesOut,
        classifiedArticles: classifiedArticlesOut,
        classifyEmptyNote,
      };

      regionDataCache.set(regionId, { data: finalData, fetchedAt: Date.now() });

      // sketch.js가 선언한 전역 변수 currentData를 직접 덮어씁니다.
      // (selectedRegion이 그 사이 바뀌지 않았을 때만 반영 — 다른 지역 클릭 후 응답이
      //  늦게 와서 화면이 엉키는 것을 방지)
      if (typeof selectedRegion !== "undefined" && selectedRegion === regionId) {
        currentData = finalData;
      }
    })
    .catch((err) => {
      console.error(`[${region.name}] API 호출 실패:`, err);
      if (typeof selectedRegion !== "undefined" && selectedRegion === regionId) {
        currentData = {
          regionId,
          regionName: region.name,
          isLoading: false,
          briefing: { official: "오류", date: "", items: ["API 호출 중 오류가 발생했습니다. 콘솔을 확인하세요."] },
          issues: ["API 호출 중 오류가 발생했습니다."],
          classifiedArticles: [],
          classifyEmptyNote: "API 호출 중 오류가 발생했습니다.",
        };
      }
    });

  return loadingPlaceholder;
}