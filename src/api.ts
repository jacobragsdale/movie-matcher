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

export type RoomUser = {
  userId: string
  username: string
}

export type JoinRoomResult = {
  roomCode: string
  userId: string
  username: string
  isNewUser: boolean
}

export type MatchWithLikers = {
  movieId: number
  likedBy: string[]
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

export const fetchMatches = async (roomCode: string): Promise<MatchWithLikers[]> => {
  const response = await fetch(
    buildApiUrl(`/api/matches/${encodeURIComponent(roomCode)}`),
  )
  if (!response.ok) {
    throw new Error('Failed to fetch matches')
  }

  const data = (await response.json()) as {
    matches?: Array<{ movie_id: number; liked_by: string[] }>
  }

  return (data.matches ?? []).map((m) => ({
    movieId: m.movie_id,
    likedBy: m.liked_by ?? [],
  }))
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

export const joinRoom = async (
  roomCode: string,
  username: string,
): Promise<JoinRoomResult> => {
  const response = await fetch(
    buildApiUrl(`/api/rooms/${encodeURIComponent(roomCode)}/join`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username }),
    },
  )

  if (response.status === 404) {
    throw new Error('Room not found')
  }

  if (!response.ok) {
    throw new Error('Failed to join room')
  }

  const data = (await response.json()) as {
    room_code: string
    user_id: string
    username: string
    is_new_user: boolean
  }

  return {
    roomCode: data.room_code,
    userId: data.user_id,
    username: data.username,
    isNewUser: data.is_new_user,
  }
}

export const fetchRoomUsers = async (roomCode: string): Promise<RoomUser[]> => {
  const response = await fetch(
    buildApiUrl(`/api/rooms/${encodeURIComponent(roomCode)}/users`),
  )

  if (!response.ok) {
    throw new Error('Failed to fetch room users')
  }

  const data = (await response.json()) as {
    users?: Array<{ user_id: string; username: string }>
  }

  return (data.users ?? []).map((u) => ({
    userId: u.user_id,
    username: u.username,
  }))
}
