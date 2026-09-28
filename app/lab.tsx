'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'

// 1편과 같습니다. 워커는 번들러가 직접 해석하게 둡니다.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type Mode = 'all' | 'visible'
type Size = { width: number; height: number }
type Stats = { canvases: number; canvasMB: number; spans: number; nodes: number }
type SlotProps = { n: number; size: Size; onRender: (n: number) => void; onText: (n: number) => void }

const SCALE = 1
const FILE = '/long.pdf'
const JUMP_TO = 150

// 지금 화면에 살아 있는 캔버스와 DOM을 셉니다.
// 캔버스 메모리는 width × height × 4바이트(RGBA)로 계산해요. react-pdf 캔버스는 scale × devicePixelRatio 크기라서
// 레티나 화면에서는 쪽 하나가 CSS 크기의 4배 픽셀이 됩니다.
function measure(): Stats {
  const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.width > 0)
  return {
    canvases: canvases.length,
    canvasMB: Math.round(canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) / 1048576),
    spans: document.querySelectorAll('.react-pdf__Page__textContent span').length,
    nodes: document.getElementsByTagName('*').length,
  }
}

// react-pdf의 텍스트 레이어는 onRenderTextLayerSuccess가 바뀌면 처음부터 다시 그려요.
// 그래서 쪽마다 콜백을 useCallback으로 고정하고, memo로 부모가 다시 그려질 때 따라 그려지지 않게 합니다.
function usePageCallbacks({ n, onRender, onText }: SlotProps) {
  const render = useCallback(() => onRender(n), [n, onRender])
  const text = useCallback(() => onText(n), [n, onText])
  return { render, text }
}

// 전부 그리기: pages.map(<Page />)
const EagerPage = memo(function EagerPage(props: SlotProps) {
  const { render, text } = usePageCallbacks(props)
  return (
    <div className="slot" data-page={props.n} style={props.size}>
      <Page pageNumber={props.n} scale={SCALE} renderAnnotationLayer={false} onRenderSuccess={render} onRenderTextLayerSuccess={text} />
    </div>
  )
})

// 보이는 쪽만: 자리(div)는 처음부터 전부 깔고, 화면 위아래 한 화면 안에 들어온 쪽만 <Page>를 마운트합니다.
// 멀어지면 언마운트하는데, react-pdf가 언마운트할 때 canvas.width/height를 0으로 만들어서 메모리를 바로 돌려받아요.
const LazyPage = memo(function LazyPage(props: SlotProps) {
  const { render, text } = usePageCallbacks(props)
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="slot" data-page={props.n} style={props.size}>
      {near ? (
        <Page pageNumber={props.n} scale={SCALE} renderAnnotationLayer={false} onRenderSuccess={render} onRenderTextLayerSuccess={text} />
      ) : (
        <span className="num">{props.n}</span>
      )}
    </div>
  )
})

export default function Lab() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [unstable, setUnstable] = useState(false)
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState<Size | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [times, setTimes] = useState<{ firstCanvas?: number; firstText?: number; allCanvas?: number; jump?: number }>({})
  const jumpStart = useRef<number | null>(null)
  const seen = useRef(new Set<number>())
  const total = useRef(0)

  // 모드는 주소로 고릅니다(?mode=all). 모드를 바꿀 때마다 새로 불러와야 공정하게 잴 수 있어요.
  // &unstable=1을 붙이면 쪽마다 인라인 콜백을 넘기는, 흔한 코드로 바꿔 줍니다.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setMode(q.get('mode') === 'all' ? 'all' : 'visible')
    setUnstable(q.get('unstable') === '1')
  }, [])

  // 0.5초마다 통계를 다시 잽니다. 이게 곧 "부모 컴포넌트가 자주 다시 그려지는" 상황이에요.
  useEffect(() => {
    const id = setInterval(() => setStats(measure()), 500)
    return () => clearInterval(id)
  }, [])

  const now = () => Math.round(performance.now())
  const onRender = useCallback((n: number) => {
    seen.current.add(n)
    if (n === 1) setTimes((t) => (t.firstCanvas ? t : { ...t, firstCanvas: now() }))
    if (seen.current.size === total.current) setTimes((t) => (t.allCanvas ? t : { ...t, allCanvas: now() }))
    if (n === JUMP_TO && jumpStart.current !== null) {
      const ms = Math.round(performance.now() - jumpStart.current)
      jumpStart.current = null
      setTimes((t) => ({ ...t, jump: ms }))
    }
  }, [])
  const onText = useCallback((n: number) => {
    if (n === 1) setTimes((t) => (t.firstText ? t : { ...t, firstText: now() }))
  }, [])
  const jump = () => {
    const el = document.querySelector(`[data-page="${JUMP_TO}"]`)
    if (!el) return
    if (seen.current.has(JUMP_TO)) setTimes((t) => ({ ...t, jump: 0 }))
    else {
      setTimes((t) => ({ ...t, jump: undefined }))
      jumpStart.current = performance.now()
    }
    el.scrollIntoView({ block: 'start' })
  }

  if (!mode) return null
  const pages = Array.from({ length: numPages }, (_, i) => i + 1)
  const href = (m: Mode) => `?mode=${m}${unstable ? '&unstable=1' : ''}`

  return (
    <>
      <div className="panel sticky">
        <div className="row">
          <strong>모드</strong>
          <a className="btn" aria-current={mode === 'all' ? 'page' : undefined} href={href('all')}>
            전부 그리기
          </a>
          <a className="btn" aria-current={mode === 'visible' ? 'page' : undefined} href={href('visible')}>
            보이는 쪽만
          </a>
          <button onClick={jump} disabled={!numPages}>
            {JUMP_TO}쪽으로 가기
          </button>
          {mode === 'all' && (
            <a className="mute" href={`?mode=all${unstable ? '' : '&unstable=1'}`}>
              {unstable ? '콜백 고정으로 돌아가기' : '인라인 콜백으로 바꿔 보기'}
            </a>
          )}
        </div>
        <table>
          <tbody>
            <tr>
              <th>그려 둔 캔버스</th>
              <td>
                {stats?.canvases ?? '-'}장 · {stats?.canvasMB ?? '-'}MB
              </td>
              <th>DOM 노드</th>
              <td>
                {stats?.nodes.toLocaleString() ?? '-'} (텍스트 span {stats?.spans.toLocaleString() ?? '-'})
              </td>
            </tr>
            <tr>
              <th>1쪽 그림 · 1쪽 글자</th>
              <td>
                {times.firstCanvas ?? '-'}ms · {times.firstText ?? '-'}ms <span className="mute">(페이지를 연 뒤)</span>
              </td>
              <th>{JUMP_TO}쪽까지</th>
              <td>{times.jump === undefined ? '-' : `${times.jump}ms`}</td>
            </tr>
            <tr>
              <th>모든 쪽 그림</th>
              <td colSpan={3}>
                {times.allCanvas ?? '-'}ms <span className="mute">(보이는 쪽만 모드에서는 끝까지 스크롤해야 채워져요)</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          {numPages}쪽 · scale {SCALE} · devicePixelRatio {window.devicePixelRatio}
          {unstable && mode === 'all' ? ' · 인라인 콜백(텍스트 레이어가 0.5초마다 다시 그려져요)' : ' · 콜백 고정'}. 캔버스 메모리는 width × height × 4바이트로 계산했어요.
        </p>
      </div>

      <Document
        file={FILE}
        loading="PDF 여는 중…"
        onLoadSuccess={async (pdf) => {
          // 자리 크기는 1쪽에서 한 번만 잽니다. 이 PDF는 모든 쪽 크기가 같아요.
          const first = await pdf.getPage(1)
          const vp = first.getViewport({ scale: SCALE })
          setSize({ width: Math.floor(vp.width), height: Math.floor(vp.height) })
          total.current = pdf.numPages
          setNumPages(pdf.numPages)
        }}
      >
        <div className="list">
          {size &&
            pages.map((n) =>
              unstable && mode === 'all' ? (
                // 흔히 쓰는 모양: 쪽마다 새 화살표 함수를 넘깁니다. 부모가 다시 그려질 때마다 콜백이 바뀌어요.
                <div key={n} className="slot" data-page={n} style={size}>
                  <Page
                    pageNumber={n}
                    scale={SCALE}
                    renderAnnotationLayer={false}
                    onRenderSuccess={() => onRender(n)}
                    onRenderTextLayerSuccess={() => onText(n)}
                  />
                </div>
              ) : mode === 'all' ? (
                <EagerPage key={n} n={n} size={size} onRender={onRender} onText={onText} />
              ) : (
                <LazyPage key={n} n={n} size={size} onRender={onRender} onText={onText} />
              ),
            )}
        </div>
      </Document>
    </>
  )
}
