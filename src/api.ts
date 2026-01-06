const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type SwipeDirection = 'left' | 'right'

export type SwipePayload = {
  roomCode: string
  userId: string
  movieId: number
  direction: SwipeDirection
}

const buildApiUrl = (path: string) => `${API_BASE_URL}${path}`

export const sendSwipe = async (payload: SwipePayload) => {
  const response = await fetch(buildApiUrl('/api/swipe'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      room_code: payload.roomCode,
      user_id: payload.userId,
      movie_id: payload.movieId,
      direction: payload.direction,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to record swipe')
  }
}

export const fetchMatches = async (roomCode: string) => {
  const response = await fetch(
    buildApiUrl(`/api/matches/${encodeURIComponent(roomCode)}`),
  )
  if (!response.ok) {
    throw new Error('Failed to fetch matches')
  }

  const data = (await response.json()) as unknown
  const ids = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && 'matches' in data
      ? (data as { matches?: unknown }).matches
      : []

  return Array.isArray(ids)
    ? ids.filter((id): id is number => typeof id === 'number')
    : []
}
