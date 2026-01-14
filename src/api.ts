const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type SwipeDirection = 'left' | 'right'

export type SwipePayload = {
  roomCode: string
  userId: string
  movieId: number
  direction: SwipeDirection
}

export type CreateRoomPayload = {
  roomCode: string
  genreIds: number[]
  providerIds: number[]
}

export type Room = {
  roomCode: string
  genreIds: number[]
  providerIds: number[]
  createdAt: string
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

export const createRoom = async (payload: CreateRoomPayload): Promise<Room> => {
  const response = await fetch(buildApiUrl('/api/rooms'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      room_code: payload.roomCode,
      genre_ids: payload.genreIds,
      provider_ids: payload.providerIds,
    }),
  })

  if (!response.ok) {
    if (response.status === 409) {
      throw new Error('Room already exists')
    }
    throw new Error('Failed to create room')
  }

  const data = (await response.json()) as {
    room_code: string
    genre_ids: number[]
    provider_ids: number[]
    created_at: string
  }

  return {
    roomCode: data.room_code,
    genreIds: data.genre_ids,
    providerIds: data.provider_ids,
    createdAt: data.created_at,
  }
}

export const fetchRoom = async (roomCode: string): Promise<Room | null> => {
  const response = await fetch(
    buildApiUrl(`/api/rooms/${encodeURIComponent(roomCode)}`),
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch room')
  }

  const data = (await response.json()) as {
    room_code: string
    genre_ids: number[]
    provider_ids: number[]
    created_at: string
  }

  return {
    roomCode: data.room_code,
    genreIds: data.genre_ids,
    providerIds: data.provider_ids,
    createdAt: data.created_at,
  }
}

export const fetchUserSwipes = async (
  roomCode: string,
  userId: string,
): Promise<number[]> => {
  const response = await fetch(
    buildApiUrl(
      `/api/swipes/${encodeURIComponent(roomCode)}/${encodeURIComponent(userId)}`,
    ),
  )

  if (!response.ok) {
    throw new Error('Failed to fetch user swipes')
  }

  const data = (await response.json()) as { swiped_movie_ids?: number[] }
  return data.swiped_movie_ids ?? []
}
