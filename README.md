# pdf-page-virtualization

300쪽 PDF를 react-pdf로 띄울 때, 모든 쪽을 한꺼번에 그리는 것과 화면 근처의 쪽만 그리는 것을 비교하는 최소 예제예요.
블로그 글 [「300쪽을 다 그려도 첫 쪽은 빨리 뜬다」](https://danbom425.tistory.com/entry/pdf-page-virtualization)(브라우저에서 문서 다루기 #4)의 재현 저장소입니다.

## 결론 먼저

headless Chromium 140, 창 1280×900, devicePixelRatio 2에서 2~4번 잰 범위예요.

| | 전부 그리기 | 보이는 쪽만 |
| --- | --- | --- |
| 1쪽 그림 | 0.8~1.0초 | 0.5~0.8초 |
| 1쪽 글자 (텍스트 레이어) | **7.6~8.6초** | 0.6~0.8초 |
| 살아 있는 캔버스 | **300장 · 2,219MB** | 2~5장 · 15~37MB |
| DOM 노드 | 26,150 | 819~1,074 |
| 브라우저 메모리 (RSS 최대) | **3.0~3.1GB** | 0.27~0.33GB (끝까지 스크롤해도 0.58GB) |
| 150쪽으로 이동 | 이미 그려 둠 | 0.1~0.2초 |

첫 쪽은 두 방식 모두 1초 안에 떠요. 그래서 전부 그리기의 비용을 늦게 알아채게 됩니다.

그리고 전부 그리기에서 `<Page>`에 인라인 콜백(`onRenderTextLayerSuccess={() => …}`)을 넘기면,
부모가 다시 그려질 때마다 300쪽의 텍스트 레이어가 취소되고 처음부터 다시 그려져요.
이 화면은 통계를 0.5초마다 갱신하는데, 100초 동안 0.5초 간격으로 쟀더니 10초 이후 155번 중 149번은 텍스트 span이 0개였어요.

## 실행

```bash
npm install
npm run build && npm start   # http://localhost:3000 — 숫자는 이렇게 띄워서 쟀어요
npm run versions             # next / react-pdf / pdfjs-dist 버전 확인
```

`next.config.ts`는 비어 있어요. 이유는 [1편 저장소](https://github.com/danbom/nextjs-pdfjs-minimal)에 있습니다.

## 화면에서 볼 것

1. **전부 그리기**(`?mode=all`) — 표의 캔버스가 300장으로 나와요. devicePixelRatio 2 화면이면 2,219MB예요.
   「1쪽 글자」가 8초 안팎이고, 「모든 쪽 그림」과 거의 같은 때 채워져요.
2. **보이는 쪽만**(`?mode=visible`) — 캔버스가 2~5장이고 1쪽 글자는 1초 안에 떠요.
3. **150쪽으로 가기** — 보이는 쪽만 모드에서는 그 자리에서 150쪽을 새로 그려요. 0.2초 안쪽이에요.
4. 전부 그리기에서 **인라인 콜백으로 바꿔 보기** — 그림은 멀쩡한데 텍스트 span이 대부분 0으로 나와요.
5. 보이는 쪽만 모드에서 **끝까지 스크롤** — 캔버스는 5장 안팎에 머물고, 끝에 닿으면 「모든 쪽 그림」이 채워져요.

## 코드

- `app/lab.tsx` — 화면 전부
  - `EagerPage` — 전부 그리기. `pages.map(<Page />)`와 같은 모양이에요
  - `LazyPage` — 보이는 쪽만. 자리(div)는 처음부터 300개 깔고, `IntersectionObserver`(`rootMargin: '100% 0px'`)로 화면 위아래 한 화면 안에 들어온 쪽만 `<Page>`를 마운트해요.
    멀어지면 언마운트하는데, react-pdf가 언마운트할 때 `canvas.width`/`height`를 0으로 만들어서 메모리를 바로 돌려받아요
  - `usePageCallbacks` + `memo` — 쪽마다 콜백을 `useCallback`으로 고정해서, 부모가 다시 그려져도 텍스트 레이어가 다시 그려지지 않게 해요
  - 자리 크기는 1쪽의 viewport로 정해요. 이 PDF는 모든 쪽 크기가 같아서 괜찮지만, 쪽 크기가 섞인 문서라면 쪽마다 크기를 먼저 받아야 해요
- `scripts/make-long-pdf.py` — 테스트 PDF 생성기

## 확인한 버전과 잰 방법

- Next.js 16.3.6 · React 19.3.0 · react-pdf 10.5.0 · pdfjs-dist 5.4.296으로 `next build` → `next start` 한 뒤,
  Playwright로 headless Chromium 140을 띄워서 쟀어요(viewport 1280×900, deviceScaleFactor 2)
- 캔버스 메모리는 살아 있는 캔버스의 width × height × 4바이트 합이에요. 브라우저 메모리는 Chromium 프로세스 전체의 RSS 합이고요
- react-pdf 10.5.0 `Page/Canvas` — 그리기 전에 캔버스 크기를 `scale × devicePixelRatio` viewport로 정하고, 언마운트할 때 0으로 되돌려요.
  그리기 effect의 의존성에서 콜백은 일부러 뺐어요
- react-pdf 10.5.0 `Page/TextLayer` — 텍스트 레이어를 그리는 `useLayoutEffect`의 의존성에 `onRenderTextLayerSuccess`를 감싼 콜백과 `customTextRenderer`가 들어 있어요.
  이 값이 바뀌면 `layer.innerHTML = ''`로 비우고 처음부터 다시 그립니다
- pdf.js 기본 뷰어(pdfjs-dist 5.7.284 `web/pdf_viewer`)는 그린 쪽을 max(10, 2 × 보이는 쪽 수 + 1)개까지만 두고 가장 오래된 것부터 지워요

## 테스트 PDF 다시 만들기

```bash
python3 scripts/make-long-pdf.py public 300   # public/long.pdf 를 다시 씁니다 (reportlab 필요)
```

Letter 크기(612×792pt) 300쪽이고, 쪽마다 제목 한 줄과 본문 40줄이 있어서 텍스트 span이 쪽당 42개, 모두 12,600개예요.
쪽 번호를 오른쪽 위에 크게 찍어 둬서 스크롤 위치를 알아보기 쉬워요.
