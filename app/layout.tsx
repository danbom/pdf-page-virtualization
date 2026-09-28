import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '300쪽 PDF 가상화 실험',
  description: 'react-pdf로 모든 쪽을 그릴 때와 보이는 쪽만 그릴 때의 캔버스 메모리와 DOM 크기를 비교합니다',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
