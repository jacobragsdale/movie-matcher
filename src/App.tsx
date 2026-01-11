import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react'
import './App.css'
import { createRoom, fetchMatches, fetchRoom, sendSwipe } from './api'
import {
  fetchDiscoverMovies,
  fetchMovieDetails,
  fetchMovieVideos,
  fetchWatchProviders,
  getPosterUrl,
  getProviderLogoUrl,
  type Movie,
  type MovieDetails,
  type MovieVideo,
  type WatchProviderRegion,
} from './tmdb'

type SwipeDirection = 'left' | 'right'
type LobbyMode = 'initial' | 'create' | 'join'

type Session = {
  roomCode: string
  userId: string
  genreIds: number[]
  providerIds: number[]
}

type DetailState = {
  movieId: number | null
  isLoading: boolean
  error: string | null
  details: MovieDetails | null
  videos: MovieVideo[]
  providers: (WatchProviderRegion & { region: string }) | null
}

const SWIPE_THRESHOLD = 110
const POLL_INTERVAL = 4000
const SESSION_STORAGE_KEY = 'movie-matcher-session'
const PREFETCH_THRESHOLD = 6
const MAX_TMDB_PAGE = 500

const GENRE_OPTIONS = [
  { id: 28, label: 'Action' },
  { id: 35, label: 'Comedy' },
  { id: 18, label: 'Drama' },
  { id: 53, label: 'Thriller' },
  { id: 27, label: 'Horror' },
  { id: 10749, label: 'Romance' },
  { id: 878, label: 'Sci-Fi' },
  { id: 12, label: 'Adventure' },
  { id: 16, label: 'Animation' },
  { id: 99, label: 'Documentary' },
]

const PROVIDER_OPTIONS = [
  { id: 8, label: 'Netflix' },
  { id: 15, label: 'Hulu' },
  { id: 9, label: 'Prime Video' },
  { id: 384, label: 'HBO Max' },
  { id: 531, label: 'Paramount+' },
  { id: 337, label: 'Disney+' },
  { id: 350, label: 'Apple TV+' },
]

const normalizeRoomCode = (value: string) =>
  value.replace(/\s+/g, '').toUpperCase()

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

const createUserId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().split('-')[0]
  }

  return Math.random().toString(36).slice(2, 8)
}

const loadSession = (): Session | null => {
  const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!stored) {
    return null
  }

  try {
    const parsed = JSON.parse(stored) as Partial<Session>
    if (parsed.roomCode && parsed.userId) {
      return {
        roomCode: parsed.roomCode,
        userId: parsed.userId,
        genreIds: Array.isArray(parsed.genreIds)
          ? parsed.genreIds.filter((id): id is number => typeof id === 'number')
          : [],
        providerIds: Array.isArray(parsed.providerIds)
          ? parsed.providerIds.filter((id): id is number => typeof id === 'number')
          : [],
      }
    }
  } catch {
    return null
  }

  return null
}

const saveSession = (session: Session | null) => {
  if (!session) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

const openExternal =
  (url: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

const getRegion = () => 'US'

const formatRuntime = (runtime?: number) => {
  if (!runtime) {
    return '—'
  }

  const hours = Math.floor(runtime / 60)
  const minutes = runtime % 60
  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

const formatDate = (date?: string) => {
  if (!date) {
    return '—'
  }

  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('initial')
  const [roomInput, setRoomInput] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [draftUserId, setDraftUserId] = useState(() => createUserId())
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([])
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([])
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const [movies, setMovies] = useState<Movie[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoadingMovies, setIsLoadingMovies] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [moviesError, setMoviesError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const [matches, setMatches] = useState<number[]>([])
  const [newMatches, setNewMatches] = useState<number[]>([])
  const [showMatchNotice, setShowMatchNotice] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [swipeError, setSwipeError] = useState<string | null>(null)
  const [expandedMovieId, setExpandedMovieId] = useState<number | null>(null)
  const [detailState, setDetailState] = useState<DetailState>({
    movieId: null,
    isLoading: false,
    error: null,
    details: null,
    videos: [],
    providers: null,
  })

  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection | null>(
    null,
  )

  const startXRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)
  const loadingPageRef = useRef<number | null>(null)
  const apiKey = import.meta.env.VITE_TMDB_API_KEY as string | undefined

  useEffect(() => {
    const stored = loadSession()
    if (stored) {
      setSession(stored)
      setRoomInput(stored.roomCode)
      setSelectedGenreIds(stored.genreIds)
      setSelectedProviderIds(stored.providerIds)
      return
    }

    // Check for room code in URL
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam) {
      const code = normalizeRoomCode(roomParam)
      if (code) {
        setRoomInput(code)
        setLobbyMode('join')
        // Clear the URL parameter
        const url = new URL(window.location.href)
        url.searchParams.delete('room')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [])

  const loadMovies = (pageToLoad: number, replace: boolean) => {
    if (!apiKey) {
      setMoviesError('Add VITE_TMDB_API_KEY to your environment to load movies.')
      setIsLoadingMovies(false)
      setIsLoadingMore(false)
      if (replace) {
        setMovies([])
      }
      setHasMore(false)
      return
    }

    if (loadingPageRef.current === pageToLoad) {
      return
    }

    loadingPageRef.current = pageToLoad
    if (replace) {
      setIsLoadingMovies(true)
    } else {
      setIsLoadingMore(true)
    }
    setMoviesError(null)

    fetchDiscoverMovies(
      apiKey,
      pageToLoad,
      session?.genreIds ?? [],
      session?.providerIds ?? [],
    )
      .then((results) => {
        const filtered = results.filter((movie) => movie.poster_path)
        setMovies((prev) => (replace ? filtered : [...prev, ...filtered]))
        setPage(pageToLoad)
        if (results.length === 0 || pageToLoad >= MAX_TMDB_PAGE) {
          setHasMore(false)
        }
      })
      .catch(() => {
        setMoviesError('Unable to load movies from TMDB right now.')
      })
      .finally(() => {
        if (replace) {
          setIsLoadingMovies(false)
        } else {
          setIsLoadingMore(false)
        }
        loadingPageRef.current = null
      })
  }

  useEffect(() => {
    if (!session) {
      return
    }

    setMovies([])
    setCurrentIndex(0)
    setPage(0)
    setHasMore(true)
    setIsLoadingMore(false)
    loadMovies(1, true)
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }

    let isActive = true
    const poll = async () => {
      try {
        const ids = await fetchMatches(session.roomCode)
        if (!isActive) {
          return
        }

        setPollError(null)
        setMatches((prev) => {
          const next = Array.from(new Set(ids))
          const added = next.filter((id) => !prev.includes(id))
          if (added.length > 0) {
            setNewMatches(added)
            setShowMatchNotice(true)
          }
          return next
        })
      } catch {
        if (!isActive) {
          return
        }

        setPollError('Waiting for match updates...')
      }
    }

    poll()
    const intervalId = window.setInterval(poll, POLL_INTERVAL)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [session])

  useEffect(() => {
    if (!session || !hasMore || isLoadingMovies || isLoadingMore) {
      return
    }

    const remaining = movies.length - currentIndex
    if (remaining <= PREFETCH_THRESHOLD) {
      const nextPage = page > 0 ? page + 1 : 1
      if (nextPage <= MAX_TMDB_PAGE) {
        loadMovies(nextPage, false)
      }
    }
  }, [
    session,
    hasMore,
    isLoadingMovies,
    isLoadingMore,
    movies.length,
    currentIndex,
    page,
  ])

  useEffect(() => {
    if (!session || !hasMore || isLoadingMovies || isLoadingMore) {
      return
    }

    const hasActiveMovie = Boolean(movies[currentIndex])
    if (!hasActiveMovie && movies.length > 0) {
      const nextPage = page > 0 ? page + 1 : 1
      if (nextPage <= MAX_TMDB_PAGE) {
        loadMovies(nextPage, false)
      }
    }
  }, [
    session,
    hasMore,
    isLoadingMovies,
    isLoadingMore,
    movies.length,
    currentIndex,
    page,
  ])

  useEffect(() => {
    if (!expandedMovieId) {
      setDetailState({
        movieId: null,
        isLoading: false,
        error: null,
        details: null,
        videos: [],
        providers: null,
      })
      return
    }

    if (!apiKey) {
      setDetailState({
        movieId: expandedMovieId,
        isLoading: false,
        error: 'Add VITE_TMDB_API_KEY to load movie details.',
        details: null,
        videos: [],
        providers: null,
      })
      return
    }

    let isActive = true
    const region = getRegion()
    setDetailState({
      movieId: expandedMovieId,
      isLoading: true,
      error: null,
      details: null,
      videos: [],
      providers: null,
    })

    Promise.all([
      fetchMovieDetails(apiKey, expandedMovieId),
      fetchMovieVideos(apiKey, expandedMovieId),
      fetchWatchProviders(apiKey, expandedMovieId, region),
    ])
      .then(([details, videos, providers]) => {
        if (!isActive) {
          return
        }

        setDetailState({
          movieId: expandedMovieId,
          isLoading: false,
          error: null,
          details,
          videos,
          providers,
        })
      })
      .catch(() => {
        if (!isActive) {
          return
        }

        setDetailState({
          movieId: expandedMovieId,
          isLoading: false,
          error: 'Unable to load movie details right now.',
          details: null,
          videos: [],
          providers: null,
        })
      })

    return () => {
      isActive = false
    }
  }, [expandedMovieId])

  useEffect(() => {
    const original = document.body.style.overflow
    if (expandedMovieId) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = original
    }

    return () => {
      document.body.style.overflow = original
    }
  }, [expandedMovieId])

  const activeMovie = movies[currentIndex] ?? null
  const nextMovie = movies[currentIndex + 1] ?? null

  const movieLookup = useMemo(() => {
    return new Map(movies.map((movie) => [movie.id, movie]))
  }, [movies])

  const activeDetailState =
    detailState.movieId === expandedMovieId ? detailState : null
  const detailMovie = activeDetailState?.details ?? (expandedMovieId
    ? movieLookup.get(expandedMovieId) ?? null
    : null)
  const detailPoster = getPosterUrl(detailMovie?.poster_path ?? null)
  const detailOverview = detailMovie?.overview ?? ''
  const ratingValue =
    activeDetailState?.details?.vote_average ?? detailMovie?.vote_average
  const voteCount =
    activeDetailState?.details?.vote_count ?? detailMovie?.vote_count
  const detailGenres =
    activeDetailState?.details?.genres?.map((genre) => genre.name).join(', ') ??
    '—'
  const detailLanguages =
    activeDetailState?.details?.spoken_languages
      ?.map((lang) => lang.english_name ?? lang.name)
      .filter(Boolean)
      .join(', ') ?? '—'
  const detailCompanies =
    activeDetailState?.details?.production_companies
      ?.slice(0, 3)
      .map((company) => company.name)
      .join(', ') ?? '—'
  const trailer =
    (activeDetailState?.videos ?? []).find(
      (video) =>
        video.site === 'YouTube' &&
        (video.type === 'Trailer' || video.type === 'Teaser'),
    ) ?? (activeDetailState?.videos ?? []).find((video) => video.site === 'YouTube')
  const youtubeUrl = trailer
    ? `https://www.youtube.com/watch?v=${trailer.key}`
    : null
  const imdbUrl = activeDetailState?.details?.imdb_id
    ? `https://www.imdb.com/title/${activeDetailState.details.imdb_id}/`
    : null
  const detailLoading =
    activeDetailState?.isLoading ?? (expandedMovieId !== null && !activeDetailState)
  const detailError = activeDetailState?.error ?? null
  const detailProviders = activeDetailState?.providers ?? null
  const homepageUrl = activeDetailState?.details?.homepage ?? null
  const tmdbWatchUrl = detailProviders?.link ?? null

  const providerGroups = detailProviders
    ? [
        {
          label: 'Stream',
          items: detailProviders.flatrate ?? [],
        },
        {
          label: 'Rent',
          items: detailProviders.rent ?? [],
        },
        {
          label: 'Buy',
          items: detailProviders.buy ?? [],
        },
      ].filter((group) => group.items.length > 0)
    : []

  const activeProviderLabels = (session?.providerIds ?? [])
    .map((id) => PROVIDER_OPTIONS.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label))
  const activeGenreLabels = (session?.genreIds ?? [])
    .map((id) => GENRE_OPTIONS.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label))

  const checkForNewMatches = async (roomCode: string) => {
    try {
      const ids = await fetchMatches(roomCode)
      setMatches((prev) => {
        const next = Array.from(new Set(ids))
        const added = next.filter((id) => !prev.includes(id))
        if (added.length > 0) {
          setNewMatches(added)
          setShowMatchNotice(true)
        }
        return next
      })
    } catch {
      // Silently fail - polling will catch it
    }
  }

  const finalizeSwipe = (direction: SwipeDirection) => {
    if (!activeMovie || !session) {
      return
    }

    const card = activeMovie
    setSwipeDirection(direction)

    if (direction === 'right') {
      setSwipeError(null)
      sendSwipe({
        roomCode: session.roomCode,
        userId: session.userId,
        movieId: card.id,
        direction,
      })
        .then(() => checkForNewMatches(session.roomCode))
        .catch(() => {
          setSwipeError('Unable to reach the server for your swipe.')
        })
    }

    window.setTimeout(() => {
      setCurrentIndex((prev) => prev + 1)
      setSwipeDirection(null)
      setDragX(0)
    }, 220)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeMovie || swipeDirection) {
      return
    }

    pointerIdRef.current = event.pointerId
    startXRef.current = event.clientX
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) {
      return
    }

    const dx = event.clientX - startXRef.current
    setDragX(dx)
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
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

  const getShareableUrl = (roomCode: string) => {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('room', roomCode)
    return url.toString()
  }

  const handleCopyUrl = async () => {
    if (!generatedCode) return
    try {
      await navigator.clipboard.writeText(getShareableUrl(generatedCode))
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const url = getShareableUrl(generatedCode)
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    }
  }

  const handleCreateRoom = () => {
    const code = generateRoomCode()
    setGeneratedCode(code)
    setLobbyMode('create')
    setLobbyError(null)
    setUrlCopied(false)
  }

  const handleJoinMode = () => {
    setLobbyMode('join')
    setLobbyError(null)
  }

  const handleBackToInitial = () => {
    setLobbyMode('initial')
    setRoomInput('')
    setGeneratedCode('')
    setLobbyError(null)
  }

  const handleStartSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const code = lobbyMode === 'create' ? generatedCode : normalizeRoomCode(roomInput)
    if (!code) {
      setLobbyError('Enter a room code to continue.')
      return
    }

    setIsJoining(true)
    setLobbyError(null)

    try {
      let genreIds = selectedGenreIds
      let providerIds = selectedProviderIds

      if (lobbyMode === 'create') {
        await createRoom({
          roomCode: code,
          genreIds: selectedGenreIds,
          providerIds: selectedProviderIds,
        })
      } else {
        const room = await fetchRoom(code)
        if (!room) {
          setLobbyError('Room not found. Check the code and try again.')
          setIsJoining(false)
          return
        }
        genreIds = room.genreIds
        providerIds = room.providerIds
      }

      const nextSession = {
        roomCode: code,
        userId: draftUserId,
        genreIds,
        providerIds,
      }

      setRoomInput(code)
      setSession(nextSession)
      saveSession(nextSession)
      setLobbyMode('initial')
      setMatches([])
      setNewMatches([])
      setShowMatchNotice(false)
      setPollError(null)
      setSwipeError(null)
      setExpandedMovieId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong'
      setLobbyError(message)
    } finally {
      setIsJoining(false)
    }
  }

  const handleReset = () => {
    setSession(null)
    saveSession(null)
    setLobbyMode('initial')
    setRoomInput('')
    setGeneratedCode('')
    setDraftUserId(createUserId())
    setSelectedGenreIds([])
    setSelectedProviderIds([])
    setMovies([])
    setCurrentIndex(0)
    setPage(0)
    setHasMore(true)
    setIsLoadingMovies(false)
    setIsLoadingMore(false)
    setMatches([])
    setNewMatches([])
    setShowMatchNotice(false)
    setSwipeError(null)
    setPollError(null)
    setExpandedMovieId(null)
    setShowHelp(false)
  }

  const handleReloadMovies = () => {
    if (!session) {
      return
    }

    setMovies([])
    setCurrentIndex(0)
    setPage(0)
    setHasMore(true)
    setMoviesError(null)
    setIsLoadingMore(false)
    loadMovies(1, true)
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

  const isLoadingDeck = isLoadingMovies || isLoadingMore
  const emptyTitle = hasMore ? 'Loading more movies' : 'No more movies'
  const emptyHint = hasMore
    ? 'Fetching another batch from TMDB.'
    : 'Try again later for more picks.'

  const renderMatchItem = (id: number) => {
    const movie = movieLookup.get(id)
    const poster = movie ? getPosterUrl(movie.poster_path) : null

    return (
      <button
        type="button"
        className="match-item"
        key={`match-${id}`}
        onClick={() => setExpandedMovieId(id)}
      >
        {poster ? (
          <img className="match-thumb" src={poster} alt={movie?.title ?? ''} />
        ) : (
          <div className="match-thumb fallback">#{id}</div>
        )}
        <div className="match-info">
          <span className="match-title">{movie?.title ?? `Movie #${id}`}</span>
          {movie?.release_date ? (
            <span className="match-sub">{movie.release_date.slice(0, 4)}</span>
          ) : null}
        </div>
      </button>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <p className="eyebrow">Movie Matcher</p>
        <h1>{session ? 'Swipe together' : 'Find your movie match'}</h1>
        <p className="subhead">
          {session
            ? 'Swipe right when you both want to watch it.'
            : 'Create or join a room and start swiping.'}
        </p>
        {!session ? (
          <button
            type="button"
            className="help-button"
            onClick={() => setShowHelp(true)}
            aria-label="How Movie Matcher works"
          >
            ?
          </button>
        ) : null}
        {session ? (
          <div className="room-meta">
            <span className="room-pill">Room {session.roomCode}</span>
            {activeGenreLabels.length > 0 ? (
              <span className="room-pill">
                {activeGenreLabels.join(', ')}
              </span>
            ) : null}
            {activeProviderLabels.length > 0 ? (
              <span className="room-pill">
                {activeProviderLabels.join(', ')}
              </span>
            ) : null}
            <button type="button" className="link-button" onClick={handleReset}>
              Exit room
            </button>
          </div>
        ) : null}
      </header>

      {!session ? (
        <main className="lobby">
          {lobbyMode === 'initial' ? (
            <div className="lobby-options">
              <button
                type="button"
                className="lobby-option"
                onClick={handleCreateRoom}
              >
                <span className="lobby-option-title">Create a Room</span>
                <span className="lobby-option-desc">
                  Start a new session and invite others
                </span>
              </button>
              <button
                type="button"
                className="lobby-option"
                onClick={handleJoinMode}
              >
                <span className="lobby-option-title">Join a Room</span>
                <span className="lobby-option-desc">
                  Enter a code someone shared with you
                </span>
              </button>
            </div>
          ) : (
            <form className="lobby-card" onSubmit={handleStartSession}>
              <button
                type="button"
                className="lobby-back"
                onClick={handleBackToInitial}
              >
                Back
              </button>

              {lobbyMode === 'create' ? (
                <>
                  <div className="lobby-code-display">
                    <span className="lobby-code-label">Your room code</span>
                    <span className="lobby-code-value">{generatedCode}</span>
                    <button
                      type="button"
                      className="lobby-copy-button"
                      onClick={handleCopyUrl}
                    >
                      {urlCopied ? 'Copied!' : 'Copy invite link'}
                    </button>
                  </div>

                  <div className="lobby-filters">
                    <span className="lobby-filters-label">Filters (optional)</span>
                    <label>Streaming services</label>
                    <div className="filter-grid">
                      <label className="filter-option">
                        <input
                          type="checkbox"
                          checked={selectedProviderIds.length === 0}
                          onChange={() => setSelectedProviderIds([])}
                        />
                        <span>Any service</span>
                      </label>
                      {PROVIDER_OPTIONS.map((provider) => (
                        <label className="filter-option" key={provider.id}>
                          <input
                            type="checkbox"
                            checked={selectedProviderIds.includes(provider.id)}
                            onChange={() => {
                              setSelectedProviderIds((prev) =>
                                prev.includes(provider.id)
                                  ? prev.filter((id) => id !== provider.id)
                                  : [...prev, provider.id],
                              )
                            }}
                          />
                          <span>{provider.label}</span>
                        </label>
                      ))}
                    </div>
                    <label>Genres</label>
                    <div className="filter-grid">
                      <label className="filter-option">
                        <input
                          type="checkbox"
                          checked={selectedGenreIds.length === 0}
                          onChange={() => setSelectedGenreIds([])}
                        />
                        <span>Any genre</span>
                      </label>
                      {GENRE_OPTIONS.map((genre) => (
                        <label className="filter-option" key={genre.id}>
                          <input
                            type="checkbox"
                            checked={selectedGenreIds.includes(genre.id)}
                            onChange={() => {
                              setSelectedGenreIds((prev) =>
                                prev.includes(genre.id)
                                  ? prev.filter((id) => id !== genre.id)
                                  : [...prev, genre.id],
                              )
                            }}
                          />
                          <span>{genre.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="lobby-join-input">
                  <label htmlFor="roomCode">Room code</label>
                  <input
                    id="roomCode"
                    type="text"
                    value={roomInput}
                    onChange={(event) => {
                      setRoomInput(event.target.value.toUpperCase())
                      setLobbyError(null)
                    }}
                    placeholder="e.g. ABCD"
                    autoComplete="off"
                    inputMode="text"
                    maxLength={4}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                    }}
                  />
                  <span className="lobby-join-hint">
                    Enter the code shared by the room creator
                  </span>
                </div>
              )}

              {lobbyError ? <p className="form-error">{lobbyError}</p> : null}
              <button
                type="submit"
                className="button primary lobby-submit"
                disabled={isJoining}
              >
                {isJoining
                  ? 'Loading...'
                  : lobbyMode === 'create'
                    ? 'Start swiping'
                    : 'Join room'}
              </button>
            </form>
          )}
        </main>
      ) : (
        <main className="swiper">
          {pollError || moviesError || swipeError ? (
            <div className="status-row">
              {pollError ? (
                <span className="status-chip muted">{pollError}</span>
              ) : null}
              {moviesError && movies.length > 0 ? (
                <span className="status-chip error">{moviesError}</span>
              ) : null}
              {swipeError ? (
                <span className="status-chip error">{swipeError}</span>
              ) : null}
            </div>
          ) : null}

          <section className="card-stack">
            {nextMovie ? (
              <div className="card next" aria-hidden="true">
                <div className="card-media">
                  {getPosterUrl(nextMovie.poster_path) ? (
                    <img
                      src={getPosterUrl(nextMovie.poster_path) ?? ''}
                      alt=""
                    />
                  ) : (
                    <div className="poster-fallback">Poster unavailable</div>
                  )}
                  <div className="card-gradient" />
                  <div className="card-info">
                    <span className="card-title">{nextMovie.title}</span>
                    {nextMovie.release_date ? (
                      <span className="card-sub">
                        {nextMovie.release_date.slice(0, 4)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeMovie ? (
              <div
                className={cardClassName}
                style={cardStyle}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerCancel}
                role="button"
                aria-label={`Swipe ${activeMovie.title}`}
              >
                <div className="card-media">
                  {getPosterUrl(activeMovie.poster_path) ? (
                    <img
                      src={getPosterUrl(activeMovie.poster_path) ?? ''}
                      alt={activeMovie.title}
                    />
                  ) : (
                    <div className="poster-fallback">Poster unavailable</div>
                  )}
                  <div className="card-gradient" />
                  <div className="card-info">
                    <div className="card-meta">
                      <span className="card-title">{activeMovie.title}</span>
                      {activeMovie.release_date ? (
                        <span className="card-sub">
                          {activeMovie.release_date.slice(0, 4)}
                        </span>
                      ) : null}
                    </div>
                    <p className="card-overview">
                      {activeMovie.overview ||
                        'No description available for this title.'}
                    </p>
                    {typeof activeMovie.vote_average === 'number' ? (
                      <span className="card-sub">
                        Rating {activeMovie.vote_average.toFixed(1)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="card-details"
                      onClick={() => setExpandedMovieId(activeMovie.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                    >
                      Full details
                    </button>
                  </div>
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
                <span className="empty-title">{emptyTitle}</span>
                <span className="empty-hint">{emptyHint}</span>
                {!hasMore || moviesError ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={handleReloadMovies}
                    disabled={isLoadingDeck}
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            )}

            {moviesError && movies.length === 0 ? (
              <div className="overlay-status">
                <p>{moviesError}</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleReloadMovies}
                >
                  Try again
                </button>
              </div>
            ) : null}
          </section>

          <div className="action-row">
            <button
              type="button"
              className="action-button reject"
              onClick={() => finalizeSwipe('left')}
              disabled={!activeMovie || swipeDirection !== null}
            >
              Reject
            </button>
            <button
              type="button"
              className="action-button accept"
              onClick={() => finalizeSwipe('right')}
              disabled={!activeMovie || swipeDirection !== null}
            >
              Accept
            </button>
          </div>

          <section className="matches-panel">
            <div className="matches-header">
              <h2>Matches</h2>
              <span className="matches-count">{matches.length}</span>
            </div>
            {matches.length === 0 ? (
              <p className="matches-empty">No matches yet.</p>
            ) : (
              <div className="match-list">{matches.map(renderMatchItem)}</div>
            )}
          </section>
        </main>
      )}

      {showMatchNotice ? (
        <div className="match-notice" role="dialog" aria-live="assertive">
          <div className="match-notice-card">
            <h3>It&apos;s a match!</h3>
            <p>Everyone in the room liked these titles.</p>
            <div className="match-list">
              {newMatches.map(renderMatchItem)}
            </div>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setShowMatchNotice(false)
                setNewMatches([])
              }}
            >
              Keep swiping
            </button>
          </div>
        </div>
      ) : null}

      {expandedMovieId ? (
        <div className="details-sheet" role="dialog" aria-modal="true">
          <div className="details-card">
            <div className="details-header">
              {detailPoster ? (
                <img
                  className="details-poster"
                  src={detailPoster}
                  alt={detailMovie?.title ?? 'Movie poster'}
                />
              ) : (
                <div className="details-poster fallback">Poster unavailable</div>
              )}
              <div className="details-header-text">
                <h2>{detailMovie?.title ?? 'Movie details'}</h2>
                {activeDetailState?.details?.tagline ? (
                  <p className="details-tagline">
                    {activeDetailState.details.tagline}
                  </p>
                ) : null}
                {activeDetailState?.details?.status ? (
                  <span className="details-status">
                    {activeDetailState.details.status}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="details-close"
                onClick={() => setExpandedMovieId(null)}
                aria-label="Close details"
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <p className="details-loading">Loading details...</p>
            ) : null}
            {detailError ? (
              <p className="details-error">{detailError}</p>
            ) : null}

            <div className="details-actions">
              {youtubeUrl ? (
                <a
                  className="button secondary"
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openExternal(youtubeUrl)}
                >
                  Watch trailer
                </a>
              ) : null}
              {imdbUrl ? (
                <a
                  className="button secondary"
                  href={imdbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openExternal(imdbUrl)}
                >
                  IMDb
                </a>
              ) : null}
              {homepageUrl ? (
                <a
                  className="button secondary"
                  href={homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openExternal(homepageUrl)}
                >
                  Official site
                </a>
              ) : null}
              {tmdbWatchUrl ? (
                <a
                  className="button secondary"
                  href={tmdbWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openExternal(tmdbWatchUrl)}
                >
                  TMDB watch
                </a>
              ) : null}
            </div>

            <div className="details-grid">
              <div>
                <span className="details-label">Release</span>
                <span>{formatDate(detailMovie?.release_date)}</span>
              </div>
              <div>
                <span className="details-label">Runtime</span>
                <span>{formatRuntime(activeDetailState?.details?.runtime)}</span>
              </div>
              <div>
                <span className="details-label">Rating</span>
                <span>
                  {typeof ratingValue === 'number'
                    ? `${ratingValue.toFixed(1)} / 10`
                    : '—'}
                  {typeof voteCount === 'number'
                    ? ` (${voteCount.toLocaleString()} votes)`
                    : ''}
                </span>
              </div>
              <div>
                <span className="details-label">Genres</span>
                <span>{detailGenres}</span>
              </div>
              <div>
                <span className="details-label">Languages</span>
                <span>{detailLanguages}</span>
              </div>
              <div>
                <span className="details-label">Studios</span>
                <span>{detailCompanies}</span>
              </div>
            </div>

            <div className="details-section">
              <h3>Overview</h3>
              <p className="details-overview">
                {detailOverview || 'No overview available yet.'}
              </p>
            </div>

            <div className="details-section">
              <div className="details-section-header">
                <h3>Where to watch</h3>
                {detailProviders?.region ? (
                  <span className="details-label">
                    Region {detailProviders.region}
                  </span>
                ) : null}
              </div>
              {providerGroups.length === 0 ? (
                <p className="details-empty">
                  Streaming info is not available for this region.
                </p>
              ) : (
                <div className="provider-groups">
                  {providerGroups.map((group) => (
                    <div className="provider-group" key={group.label}>
                      <span className="details-label">{group.label}</span>
                      <div className="provider-list">
                        {group.items.map((provider) => {
                          const logo = getProviderLogoUrl(
                            provider.logo_path ?? null,
                          )
                          return (
                            <div
                              className="provider-item"
                              key={`${group.label}-${provider.provider_id}`}
                            >
                              {logo ? (
                                <img
                                  src={logo}
                                  alt={provider.provider_name}
                                />
                              ) : (
                                <div className="provider-fallback">
                                  {provider.provider_name.slice(0, 2)}
                                </div>
                              )}
                              <span>{provider.provider_name}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="button primary"
              onClick={() => setExpandedMovieId(null)}
            >
              Back to swiping
            </button>
          </div>
        </div>
      ) : null}

      {showHelp ? (
        <div className="help-sheet" role="dialog" aria-modal="true">
          <div className="help-card">
            <div className="help-header">
              <h2>How Movie Matcher works</h2>
              <button
                type="button"
                className="details-close"
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
              >
                Close
              </button>
            </div>
            <p>
              Movie Matcher helps your group agree on what to watch by swiping
              through a shared deck. When everyone in the room likes the same
              movie, it shows up as a match.
            </p>
            <div className="help-section">
              <h3>Room code</h3>
              <p>
                Share the same room code with your friends so you all swipe on
                the same list.
              </p>
            </div>
            <div className="help-section">
              <h3>Genre + streaming filters</h3>
              <p>
                Pick a genre and streaming services to focus the deck. Choose
                “Any” to keep it wide open.
              </p>
            </div>
            <div className="help-section">
              <h3>Add to Home Screen (iPhone)</h3>
              <p>
                Open the share menu in Safari and tap “Add to Home Screen” to
                install the app for quick access.
              </p>
            </div>
            <button
              type="button"
              className="button primary"
              onClick={() => setShowHelp(false)}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
