import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DemoSlideshow } from './demo/DemoSlideshow.tsx'

const isSlideshow =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('slideshow')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSlideshow ? <DemoSlideshow /> : <App />}
  </StrictMode>,
)
