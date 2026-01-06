type MovieResult = {
  id: number
  title: string
  release_date?: string
  overview?: string
  poster_path: string | null
  vote_average?: number
  vote_count?: number
}

export type Movie = MovieResult

export type MovieDetails = MovieResult & {
  tagline?: string
  runtime?: number
  genres?: { id: number; name: string }[]
  imdb_id?: string | null
  homepage?: string | null
  status?: string
  spoken_languages?: { english_name?: string; name?: string }[]
  production_companies?: { id: number; name: string }[]
}

export type MovieVideo = {
  id?: string
  key: string
  name: string
  site: string
  type?: string
  official?: boolean
}

export type WatchProvider = {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority?: number
}

export type WatchProviderRegion = {
  link?: string
  flatrate?: WatchProvider[]
  rent?: WatchProvider[]
  buy?: WatchProvider[]
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w92'

export const getPosterUrl = (path: string | null) => {
  if (!path) {
    return null
  }

  return `${TMDB_IMAGE_BASE}${path}`
}

export const getProviderLogoUrl = (path: string | null) => {
  if (!path) {
    return null
  }

  return `${TMDB_LOGO_BASE}${path}`
}

const MIN_VOTE_COUNT = 1000

export const fetchTopRatedMovies = async (
  apiKey: string,
  page = 1,
  minVoteCount = MIN_VOTE_COUNT,
): Promise<Movie[]> => {
  const url = new URL(`${TMDB_BASE_URL}/discover/movie`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('include_video', 'false')
  url.searchParams.set('language', 'en-US')
  url.searchParams.set('sort_by', 'vote_average.desc')
  url.searchParams.set('vote_count.gte', String(minVoteCount))
  url.searchParams.set('page', String(page))

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch movies')
  }

  const data = (await response.json()) as { results?: MovieResult[] }
  return data.results ?? []
}

export const fetchMovieDetails = async (
  apiKey: string,
  movieId: number,
): Promise<MovieDetails> => {
  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'en-US')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch movie details')
  }

  return (await response.json()) as MovieDetails
}

export const fetchMovieVideos = async (
  apiKey: string,
  movieId: number,
): Promise<MovieVideo[]> => {
  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}/videos`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'en-US')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch movie videos')
  }

  const data = (await response.json()) as { results?: MovieVideo[] }
  return data.results ?? []
}

export const fetchWatchProviders = async (
  apiKey: string,
  movieId: number,
  region: string,
): Promise<(WatchProviderRegion & { region: string }) | null> => {
  const url = new URL(`${TMDB_BASE_URL}/movie/${movieId}/watch/providers`)
  url.searchParams.set('api_key', apiKey)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch watch providers')
  }

  const data = (await response.json()) as {
    results?: Record<string, WatchProviderRegion>
  }

  const fallback = data.results?.US
  const selected = data.results?.[region] ?? fallback
  if (!selected) {
    return null
  }

  return { ...selected, region: data.results?.[region] ? region : 'US' }
}
