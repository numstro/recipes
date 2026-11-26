import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Recipes',
  description: 'Our shared recipe collection',
  // Recipe blogs often 403 hotlinked images when a foreign Referer is sent.
  referrer: 'no-referrer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
