// ============================================================
// sketch.js
// p5.js 기반 지역 시사이슈 대시보드 (v3: 신문/에디토리얼 무드)
//
// 디자인 레퍼런스
//  - 신문 가판대: 종이 질감, 빛바랜 그레이/베이지, 굵은 헤드라인
//  - 에디토리얼 카드: 세이지/네이비/머스타드/크림 팔레트, 세리프 헤드라인
//  - 메인 포인트 컬러(#00b5ca)는 선택 상태/액센트로만 절제해서 사용
//
// 구조
//  - 좌측: 대한민국 백지도 위에 14개 지역을 배치한 지도
//  - 우측: 지역 클릭 시 나타나는 패널, 3개 탭으로 전환
//      탭1) 주요 행정가 SNS 브리핑
//      탭2) 지역별 현안 정리
//      탭3) 기사 분류 (사건/사고, 재판/수사, 행정, 정치, 문화, 기타)
//
// 데이터는 data.js 의 fetchRegionData() 가 공급합니다.
// 지도 윤곽 path는 map_data.js 의 KOREA_MAP_PATHS 입니다.
//
// 지금은 더미 데이터지만, 실제 LLM API 연동 시
// fetchRegionData 를 async 함수로 바꾸고 fetch() 호출로
// 교체하면 됩니다. (UI 코드는 거의 손댈 필요 없음)
// ============================================================

let selectedRegion = null;
let activeTab = 0;
let hoveredRegion = null;
let currentData = null;

const TAB_LABELS = ["SNS 브리핑", "현안 정리", "기사 분류"];
const LOADING_MSG_INTERVAL_MS = 1400; // 로딩 메시지가 바뀌는 주기

// ----- 컬러 팔레트 (신문지/에디토리얼 무드) -----
const PAPER_BG        = [247, 243, 235];   // 크림/종이 배경
const PAPER_BG_PANEL  = [241, 236, 225];   // 살짝 더 짙은 종이톤 (사이드 패널)
const INK             = [38, 35, 30];      // 신문 헤드라인용 잉크 블랙
const INK_SOFT        = [90, 84, 74];      // 본문 보조 텍스트
const RULE_LINE       = [206, 198, 182];   // 신문 구분선 (가는 선)
const NAVY            = [55, 69, 81];      // 카드 레퍼런스의 네이비
const NAVY_DARK       = [35, 46, 56];
const MUSTARD         = [197, 153, 74];    // 카드 레퍼런스의 머스타드/카멜
const MUSTARD_DARK    = [122, 87, 29];
const CREAM_CARD      = [255, 255, 236];   // 카드 레퍼런스의 아이보리

// 메인 포인트 컬러 (#00b5ca) - 선택 상태/액센트 전용
const ACCENT       = [0, 181, 202];
const ACCENT_DARK  = [0, 110, 124];
const ACCENT_TINT  = [219, 243, 246];

const MAP_LAND_FILL   = [237, 232, 219];   // 백지도 채움 (종이 베이지)
const MAP_LAND_STROKE = [199, 190, 171];   // 백지도 경계선

const MAP_W = 460;
const MAP_OFFSET_X = 40;
const HEADER_IMG_H = 88;        // 헤더 일러스트 높이
const HEADER_IMG_Y = 70;        // 헤더 일러스트 시작 y (룰선 아래)
const MAP_OFFSET_Y = HEADER_IMG_Y + HEADER_IMG_H + 22; // 일러스트 아래로 지도 시작점 이동
const MAP_SCALE = 1.0;

let headerImg; // 헤더 일러스트 (preload에서 로드)

const PANEL_X = MAP_W;
const PANEL_W = 600;
const CANVAS_W = PANEL_X + PANEL_W;
const BOTTOM_PADDING_Y = 24; // 지도 패널 하단 여백
const CANVAS_H = MAP_OFFSET_Y + 520 + BOTTOM_PADDING_Y;

// 대시보드 전체 확대 비율. 지도/패널/글자 비율은 그대로 두고 화면에 보이는 크기만 키운다.
const UI_SCALE = 1.3;
function mx() { return window.mouseX / UI_SCALE; }
function my() { return window.mouseY / UI_SCALE; }

// 기사 분류 카테고리별 색상 (네이비/머스타드/와인 계열로 절제, 청록은 제외)
const CATEGORY_COLORS = {
  "사건/사고": [150, 58, 48],     // 브릭레드
  "재판/수사": [110, 50, 70],     // 와인
  "행정":      NAVY,              // 네이비
  "정치":      [80, 70, 110],     // 인디고
  "문화":      MUSTARD_DARK,      // 카멜
  "기타":      [95, 94, 90],      // 그레이
};

let tabButtons = [];
let articleHitboxes = [];
let mapPathObjs = [];

let serifFont = "'Noto Serif KR', Georgia, serif";
let sansFont = "'Noto Sans KR', -apple-system, 'Helvetica Neue', Arial, sans-serif";

function preload() {
  // 헤더 일러스트 (전원 풍경). 로드 실패 시에도 대시보드 자체는 정상 동작하도록 catch 처리.
  headerImg = loadImage(
    "assets/header_strip_muted.jpg",
    () => {},
    () => {
      console.warn("헤더 일러스트를 불러오지 못했습니다. assets/header_strip_muted.jpg 경로를 확인하세요.");
      headerImg = null;
    }
  );
}

function setup() {
  const c = createCanvas(CANVAS_W * UI_SCALE, CANVAS_H * UI_SCALE);
  c.parent(document.body);
  textFont(sansFont);
  mapPathObjs = KOREA_MAP_PATHS.map(parseSvgPath);

  // 한글 웹폰트 프리로드 (로드 전에는 시스템 폰트로 보이다가, 로드 즉시 다음 프레임부터 자동 반영됨)
  if (document.fonts) {
    document.fonts.load("500 16px 'Noto Serif KR'");
    document.fonts.load("400 16px 'Noto Sans KR'");
  }
}

function draw() {
  background(PAPER_BG[0], PAPER_BG[1], PAPER_BG[2]);
  push();
  scale(UI_SCALE);
  drawMapPanel();
  drawSidePanel();
  pop();
  updateCursor();
}

function updateCursor() {
  if (hoveredRegion) {
    cursor(HAND);
    return;
  }
  if (activeTab === 2 && selectedRegion) {
    for (const box of articleHitboxes) {
      if (mx() > box.x && mx() < box.x + box.w && my() > box.y && my() < box.y + box.h) {
        cursor(HAND);
        return;
      }
    }
  }
  cursor(ARROW);
}

function parseSvgPath(d) {
  const tokens = d.replace(/Z/g, "").trim().split(/\s*[ML]\s*/).filter(Boolean);
  return tokens.map((t) => {
    const [x, y] = t.split(",").map(Number);
    return { x, y };
  });
}

function mapToScreen(x, y) {
  return { x: MAP_OFFSET_X + x * MAP_SCALE, y: MAP_OFFSET_Y + y * MAP_SCALE };
}

// ------------------------------------------------------------
// 좌측 지도 패널
// ------------------------------------------------------------
function drawMapPanel() {
  push();
  noStroke();
  fill(PAPER_BG[0], PAPER_BG[1], PAPER_BG[2]);
  rect(0, 0, MAP_W, CANVAS_H);

  // 신문 마스트헤드 느낌의 헤더
  fill(INK[0], INK[1], INK[2]);
  textFont(serifFont);
  textSize(20);
  textAlign(LEFT, TOP);
  text("지역 선택", 24, 18);

  textFont(sansFont);
  fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
  textSize(11);
  text("3대 통신사 보도 종합 · 지역을 클릭하세요", 24, 44);

  // 헤더 아래 신문식 더블 룰선
  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(1.4);
  line(24, 62, MAP_W - 24, 62);
  strokeWeight(0.6);
  line(24, 66, MAP_W - 24, 66);
  noStroke();

  // ---- 헤더 일러스트 (전원 풍경, 분위기용 단일 이미지) ----
  const imgX = 24;
  const imgW = MAP_W - 48;
  if (headerImg) {
    push();
    // 살짝 빈티지한 느낌으로 미세한 베이지 톤 오버레이를 위해 이미지 먼저 그리고 위에 얇게 틴트
    image(headerImg, imgX, HEADER_IMG_Y, imgW, HEADER_IMG_H);
    noFill();
    stroke(INK[0], INK[1], INK[2], 60);
    strokeWeight(1);
    rect(imgX, HEADER_IMG_Y, imgW, HEADER_IMG_H);
    noStroke();
    fill(MAP_LAND_FILL[0], MAP_LAND_FILL[1], MAP_LAND_FILL[2], 18);
    rect(imgX, HEADER_IMG_Y, imgW, HEADER_IMG_H);
    pop();
  } else {
    // 이미지 로드 실패 시 자리만 차분하게 표시
    noStroke();
    fill(MAP_LAND_FILL[0], MAP_LAND_FILL[1], MAP_LAND_FILL[2]);
    rect(imgX, HEADER_IMG_Y, imgW, HEADER_IMG_H);
  }

  // ---- 백지도 그리기 ----
  push();
  for (const pathPts of mapPathObjs) {
    beginShape();
    fill(MAP_LAND_FILL[0], MAP_LAND_FILL[1], MAP_LAND_FILL[2]);
    stroke(MAP_LAND_STROKE[0], MAP_LAND_STROKE[1], MAP_LAND_STROKE[2]);
    strokeWeight(1);
    for (const p of pathPts) {
      const s = mapToScreen(p.x, p.y);
      vertex(s.x, s.y);
    }
    endShape(CLOSE);
  }
  pop();

  // ---- 지역 노드 그리기 (지역명을 캡슐형 마커 안에 직접 표시) ----
  hoveredRegion = null;
  textFont(sansFont);
  textSize(10.5);
  const PILL_PAD_X = 9;
  // 서울/세종은 주변 지역(수도권, 대전/충남)과 가까워 가려지기 쉬우므로
  // 별도 색상을 쓰고 항상 맨 위에 그려서 눈에 잘 띄도록 한다.
  const SPECIAL_REGIONS = ["seoul", "sejong"];

  for (const region of REGIONS) {
    const screenPos = mapToScreen(region.x, region.y);
    const sx = screenPos.x;
    const sy = screenPos.y;

    const pillH = region.r * 2 + 4;
    const pillW = Math.max(pillH, textWidth(region.name) + PILL_PAD_X * 2);
    const halfW = pillW / 2;
    const halfH = pillH / 2;

    const isHover = mx() > sx - halfW && mx() < sx + halfW && my() > sy - halfH && my() < sy + halfH;
    if (isHover) hoveredRegion = region.id;

    region._sx = sx;
    region._sy = sy;
    region._hw = halfW;
    region._hh = halfH;
    region._pillW = pillW;
    region._pillH = pillH;
  }

  const drawOrder = [
    ...REGIONS.filter((r) => !SPECIAL_REGIONS.includes(r.id)),
    ...REGIONS.filter((r) => SPECIAL_REGIONS.includes(r.id)),
  ];

  for (const region of drawOrder) {
    const sx = region._sx;
    const sy = region._sy;
    const pillW = region._pillW;
    const pillH = region._pillH;
    const isSel = selectedRegion === region.id;
    const isHover = hoveredRegion === region.id;
    const isSpecial = SPECIAL_REGIONS.includes(region.id);

    noStroke();
    if (isSel) {
      fill(ACCENT[0], ACCENT[1], ACCENT[2]);
    } else if (isHover) {
      fill(NAVY[0], NAVY[1], NAVY[2]);
    } else if (isSpecial) {
      fill(MUSTARD_DARK[0], MUSTARD_DARK[1], MUSTARD_DARK[2]);
    } else {
      fill(NAVY[0], NAVY[1], NAVY[2], 200);
    }
    rectMode(CENTER);
    rect(sx, sy, pillW, pillH, pillH / 2);

    if (isSel) {
      noFill();
      stroke(ACCENT[0], ACCENT[1], ACCENT[2]);
      strokeWeight(2);
      rect(sx, sy, pillW + 6, pillH + 6, (pillH + 6) / 2);
      noStroke();
    }
    rectMode(CORNER);

    fill(255);
    textAlign(CENTER, CENTER);
    text(region.name, sx, sy + 0.5);
  }

  pop();
}

// ------------------------------------------------------------
// 우측 상세 패널
// ------------------------------------------------------------
function drawSidePanel() {
  push();
  fill(PAPER_BG_PANEL[0], PAPER_BG_PANEL[1], PAPER_BG_PANEL[2]);
  noStroke();
  rect(MAP_W, 0, PANEL_W, CANVAS_H);

  stroke(INK[0], INK[1], INK[2], 60);
  strokeWeight(1);
  line(MAP_W, 0, MAP_W, CANVAS_H);
  noStroke();

  if (!selectedRegion) {
    textFont(serifFont);
    fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
    textAlign(CENTER, CENTER);
    textSize(15);
    text("왼쪽 지도에서 지역을 선택해 주세요", PANEL_X + PANEL_W / 2, CANVAS_H / 2);
    pop();
    return;
  }

  const padX = PANEL_X + 28;
  const contentW = PANEL_W - 56;

  // 신문 헤드라인 스타일 지역명
  textFont(serifFont);
  fill(INK[0], INK[1], INK[2]);
  textAlign(LEFT, TOP);
  textSize(24);
  text(currentData.regionName, padX, 20);

  textFont(sansFont);
  fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
  textSize(11.5);
  text("연합뉴스 · 뉴시스 · 뉴스1 종합", padX, 52);

  stroke(INK[0], INK[1], INK[2]);
  strokeWeight(1.2);
  line(padX, 70, padX + contentW, 70);
  noStroke();

  drawTabs(padX, 82, contentW);

  const contentY = 138;
  if (currentData.isLoading) {
    drawLoadingState(padX, contentY, contentW);
  } else if (activeTab === 0) {
    drawBriefingTab(padX, contentY, contentW);
  } else if (activeTab === 1) {
    drawIssuesTab(padX, contentY, contentW);
  } else {
    drawClassifyTab(padX, contentY, contentW);
  }

  pop();
}

function drawTabs(x, y, w) {
  tabButtons = [];
  const tabW = w / TAB_LABELS.length;
  for (let i = 0; i < TAB_LABELS.length; i++) {
    const tx = x + i * tabW;
    const isActive = activeTab === i;

    noStroke();
    if (isActive) {
      fill(ACCENT[0], ACCENT[1], ACCENT[2]);
    } else {
      fill(PAPER_BG[0], PAPER_BG[1], PAPER_BG[2]);
      stroke(RULE_LINE[0], RULE_LINE[1], RULE_LINE[2]);
      strokeWeight(1);
    }
    rect(tx, y, tabW - 6, 30, 3);
    noStroke();

    textFont(sansFont);
    fill(isActive ? 255 : INK_SOFT[0], isActive ? 255 : INK_SOFT[1], isActive ? 255 : INK_SOFT[2]);
    textAlign(CENTER, CENTER);
    textSize(12.5);
    text(TAB_LABELS[i], tx + (tabW - 6) / 2, y + 15);

    tabButtons.push({ x: tx, y, w: tabW - 6, h: 30, idx: i });
  }
}

// API 응답을 기다리는 동안 패널 가운데에 상태 메시지를 번갈아 보여준다.
function drawLoadingState(x, y, w) {
  const messages = currentData.loadingMessages && currentData.loadingMessages.length
    ? currentData.loadingMessages
    : ["불러오는 중..."];
  const elapsed = Date.now() - (currentData.loadingStartedAt || Date.now());
  const idx = Math.floor(elapsed / LOADING_MSG_INTERVAL_MS) % messages.length;

  const centerY = y + (CANVAS_H - y) / 2 - 20;

  noStroke();
  fill(ACCENT[0], ACCENT[1], ACCENT[2]);
  for (let i = 0; i < 3; i++) {
    const phase = millis() / 260 + i * 0.6;
    const d = 5 + Math.sin(phase) * 2.5;
    circle(x + w / 2 - 16 + i * 16, centerY - 26, d);
  }

  textFont(serifFont);
  fill(INK[0], INK[1], INK[2]);
  textAlign(CENTER, CENTER);
  textSize(16);
  text(messages[idx], x + w / 2, centerY + 4);

  textFont(sansFont);
  fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
  textSize(10.5);
  text("잠시만 기다려 주세요", x + w / 2, centerY + 30);
}

function drawBriefingTab(x, y, w) {
  textFont(serifFont);
  fill(INK[0], INK[1], INK[2]);
  textAlign(LEFT, TOP);
  textSize(15);
  text("주요 행정가 SNS 브리핑", x, y);

  textFont(sansFont);
  fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
  textSize(12);
  text(currentData.briefing.official + "  ·  " + currentData.briefing.date, x, y + 22);

  let cy = y + 54;
  for (const item of currentData.briefing.items) {
    cy = drawNewsCard(x, cy, w, item, NAVY);
    cy += 10;
  }
}

function drawIssuesTab(x, y, w) {
  textFont(serifFont);
  fill(INK[0], INK[1], INK[2]);
  textAlign(LEFT, TOP);
  textSize(15);
  text("지역별 현안 정리", x, y);

  let cy = y + 28;
  for (const issue of currentData.issues) {
    cy = drawNewsCard(x, cy, w, issue, MUSTARD_DARK);
    cy += 10;
  }
}

function drawClassifyTab(x, y, w) {
  textFont(serifFont);
  fill(INK[0], INK[1], INK[2]);
  textAlign(LEFT, TOP);
  textSize(15);
  text("기사 분류", x, y);

  textFont(sansFont);
  fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
  textSize(10.5);
  text("기사를 클릭하면 해당 통신사 기사로 이동합니다", x, y + 20);

  articleHitboxes = [];

  if (currentData.classifiedArticles.length === 0) {
    textFont(sansFont);
    fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
    textAlign(CENTER, TOP);
    textSize(12.5);
    text(currentData.classifyEmptyNote || "분류된 기사가 없습니다.", x + w / 2, y + 80);
    return;
  }

  let cy = y + 42;
  for (const cat of CATEGORIES) {
    const articles = currentData.classifiedArticles.filter((a) => a.category === cat);
    if (articles.length === 0) continue;

    const col = CATEGORY_COLORS[cat];

    // 카테고리 라벨: 신문 섹션 표기 느낌 (작은 캡스 + 옆 룰선)
    noStroke();
    fill(col[0], col[1], col[2]);
    textFont(sansFont);
    textAlign(LEFT, TOP);
    textSize(10.5);
    text(cat.toUpperCase(), x, cy);
    const labelW = textWidth(cat.toUpperCase());

    stroke(col[0], col[1], col[2], 140);
    strokeWeight(1);
    line(x + labelW + 10, cy + 5, x + w, cy + 5);
    noStroke();

    cy += 24;

    for (const art of articles) {
      const boxH = 64;
      const isHover = mx() > x && mx() < x + w && my() > cy && my() < cy + boxH;

      noStroke();
      fill(isHover ? 255 : PAPER_BG[0], isHover ? 255 : PAPER_BG[1], isHover ? 255 : PAPER_BG[2]);
      stroke(isHover ? ACCENT[0] : RULE_LINE[0], isHover ? ACCENT[1] : RULE_LINE[1], isHover ? ACCENT[2] : RULE_LINE[2]);
      strokeWeight(isHover ? 1.4 : 1);
      rect(x, cy, w, boxH, 4);
      noStroke();

      // 좌측 카테고리 컬러 마커
      fill(col[0], col[1], col[2]);
      rect(x, cy, 3, boxH, 1);

      // 제목 (1줄) — wrapText로 줄바꿈 폭을 미리 계산해서 한 줄씩 그린다.
      // (p5 text()의 자동 줄바꿈 박스 인자(w,h)가 이 화면에서 텍스트를 그리지 않는
      //  문제가 있어, 이 코드베이스에 이미 있는 wrapText 방식으로 통일했다)
      const titleLines = wrapText(art.title || "", w - 36, 13, serifFont);
      fill(isHover ? ACCENT_DARK[0] : INK[0], isHover ? ACCENT_DARK[1] : INK[1], isHover ? ACCENT_DARK[2] : INK[2]);
      textFont(serifFont);
      textSize(13);
      textAlign(LEFT, TOP);
      text(titleLines[0] || "", x + 14, cy + 8);

      if (art.summary) {
        const summaryLines = wrapText(art.summary, w - 28, 10.5, sansFont).slice(0, 2);
        fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
        textFont(sansFont);
        textSize(10.5);
        textAlign(LEFT, TOP);
        for (let i = 0; i < summaryLines.length; i++) {
          text(summaryLines[i], x + 14, cy + 28 + i * 13);
        }
      }

      fill(isHover ? ACCENT[0] : 175, isHover ? ACCENT[1] : 175, isHover ? ACCENT[2] : 175);
      textFont(sansFont);
      textAlign(RIGHT, TOP);
      textSize(12);
      text("↗", x + w - 12, cy + 8);

      fill(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
      textSize(10);
      textAlign(RIGHT, BOTTOM);
      text(art.source + " · " + art.time, x + w - 14, cy + boxH - 8);

      articleHitboxes.push({ x, y: cy, w, h: boxH, url: art.url });

      cy += boxH + 8;
    }
    cy += 8;
  }
}

// 신문 기사 카드: 좌측 세로 룰선 + 세리프 헤드라인 텍스트
function drawNewsCard(x, y, w, txt, accentColor) {
  textFont(serifFont);
  textAlign(LEFT, TOP);
  textSize(13.5);
  const lineH = 19;
  const lines = wrapText(txt, w - 30, 13.5, serifFont);
  const cardH = Math.max(42, lines.length * lineH + 22);

  noStroke();
  fill(255, 255, 255, 235);
  stroke(RULE_LINE[0], RULE_LINE[1], RULE_LINE[2]);
  strokeWeight(1);
  rect(x, y, w, cardH, 4);
  noStroke();

  fill(accentColor[0], accentColor[1], accentColor[2]);
  rect(x, y, 3, cardH, 1);

  fill(INK[0], INK[1], INK[2]);
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], x + 16, y + 13 + i * lineH);
  }

  return y + cardH;
}

function wrapText(txt, maxWidth, size, font) {
  textFont(font || sansFont);
  textSize(size);
  const chars = txt.split("");
  let lines = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (textWidth(test) > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ------------------------------------------------------------
// 인터랙션
// ------------------------------------------------------------
function mousePressed() {
  if (mx() < MAP_W) {
    for (const region of REGIONS) {
      const sx = region._sx;
      const sy = region._sy;
      if (sx === undefined) continue;
      if (mx() > sx - region._hw && mx() < sx + region._hw && my() > sy - region._hh && my() < sy + region._hh) {
        selectedRegion = region.id;
        currentData = fetchRegionData(region.id);
        activeTab = 0;
        return;
      }
    }
    return;
  }

  if (activeTab === 2) {
    for (const box of articleHitboxes) {
      if (mx() > box.x && mx() < box.x + box.w && my() > box.y && my() < box.y + box.h) {
        window.open(box.url, "_blank", "noopener,noreferrer");
        return;
      }
    }
  }

  for (const btn of tabButtons) {
    if (mx() > btn.x && mx() < btn.x + btn.w && my() > btn.y && my() < btn.y + btn.h) {
      activeTab = btn.idx;
      return;
    }
  }
}
