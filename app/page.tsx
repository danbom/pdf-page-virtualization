'use client'

import dynamic from 'next/dynamic'

// pdf.js는 모듈을 읽는 순간 DOMMatrix를 만들어서 서버에서 평가되면 죽습니다(1편 내용).
const Lab = dynamic(() => import('./lab'), {
  ssr: false,
  loading: () => <p>뷰어 불러오는 중…</p>,
})

export default function Page() {
  return (
    <main>
      <h1>300쪽 PDF, 전부 그리기와 보이는 쪽만 그리기</h1>
      <p className="sub">
        같은 300쪽짜리 PDF를 두 방식으로 띄워요. 위 표에서 살아 있는 캔버스 수, 캔버스 메모리, DOM 노드 수를 비교하고, 150쪽으로
        바로 가 보세요. 모드를 바꾸면 페이지를 새로 불러와요.
      </p>
      <Lab />
    </main>
  )
}
