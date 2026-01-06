import { useMemo, useRef, useState } from 'react'
import './App.css'

type SwipeDirection = 'left' | 'right'

const SWIPE_THRESHOLD = 110

function App() {
  const deck = useMemo(
    () => Array.from({ length: 100 }, (_, index) => `Card ${index + 1}`),
    [],
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const activeCard = deck[currentIndex] ?? null
  const [accepted, setAccepted] = useState<string[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection | null>(
    null,
  )

  const startXRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)

  const finalizeSwipe = (direction: SwipeDirection) => {
    if (!activeCard) {
      return
    }

    const card = activeCard
    setSwipeDirection(direction)
    window.setTimeout(() => {
      if (direction === 'right') {
        setAccepted((prev) => [...prev, card])
      } else {
        setRejected((prev) => [...prev, card])
      }
      setCurrentIndex((prev) => prev + 1)
      setSwipeDirection(null)
      setDragX(0)
    }, 220)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeCard) {
      return
    }

    pointerIdRef.current = event.pointerId
    startXRef.current = event.clientX
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) {
      return
    }

    const dx = event.clientX - startXRef.current
    setDragX(dx)
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return
    }

    const dx = event.clientX - startXRef.current
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      finalizeSwipe(dx > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }

    setIsDragging(false)
    pointerIdRef.current = null
  }

  const handlePointerCancel = () => {
    setDragX(0)
    setIsDragging(false)
    pointerIdRef.current = null
  }

  const actionLabel =
    swipeDirection === 'right' || dragX > 25
      ? 'Accept'
      : swipeDirection === 'left' || dragX < -25
        ? 'Reject'
        : ''

  const rotation = Math.max(-12, Math.min(12, dragX / 10))
  const cardStyle =
    swipeDirection === null
      ? { transform: `translateX(${dragX}px) rotate(${rotation}deg)` }
      : undefined

  const cardClassName = [
    'card',
    isDragging ? 'dragging' : '',
    swipeDirection ? `swipe-${swipeDirection}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="app">
      <header className="app-header">
        <p className="eyebrow">Movie Matcher</p>
        <h1>Swipe to decide</h1>
        <p className="subhead">Right to accept, left to reject.</p>
      </header>

      <main className="card-stack">
        {activeCard ? (
          <div
            className={cardClassName}
            style={cardStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            role="button"
            aria-label="Swipe card"
          >
            <div className="card-content">
              <span className="card-title">{activeCard}</span>
              <span className="card-hint">Drag me left or right</span>
            </div>
            {actionLabel ? (
              <div
                className={`card-badge ${
                  actionLabel === 'Accept' ? 'accept' : 'reject'
                }`}
              >
                {actionLabel}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-card">
            <span className="empty-title">No more cards</span>
            <span className="empty-hint">
              You swiped through all 100 cards.
            </span>
          </div>
        )}
      </main>

      <section className="buckets">
        <div className="bucket">
          <div className="bucket-header">
            <span>Accepted</span>
            <span className="bucket-count">{accepted.length}</span>
          </div>
          <div className="bucket-items">
            {accepted.length === 0 ? (
              <span className="bucket-empty">None yet</span>
            ) : (
              accepted.map((card) => (
                <span className="bucket-item" key={`accept-${card}`}>
                  {card}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="bucket">
          <div className="bucket-header">
            <span>Rejected</span>
            <span className="bucket-count">{rejected.length}</span>
          </div>
          <div className="bucket-items">
            {rejected.length === 0 ? (
              <span className="bucket-empty">None yet</span>
            ) : (
              rejected.map((card) => (
                <span className="bucket-item" key={`reject-${card}`}>
                  {card}
                </span>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
