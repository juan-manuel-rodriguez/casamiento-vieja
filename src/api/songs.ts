import { getJson, postJson } from "./client";

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: string;
  album: string;
  imageUrl: string;
  spotifyUrl: string;
  previewUrl: string;
};

export type SongRecommendation = {
  timestamp: string;
  guestId: string;
  trackId: string;
  trackName: string;
  artists: string;
  spotifyUrl: string;
};

export async function searchSongs(query: string): Promise<SpotifyTrack[]> {
  if (query.trim().length < 2) return [];
  const response = await getJson<{ tracks: SpotifyTrack[] }>({
    action: "searchSongs",
    query,
  });
  return response.tracks;
}

export type SongRecommendationPayload = {
  id: string;
  trackId: string;
  trackName: string;
  artists: string;
  spotifyUrl: string;
};

export async function submitSongRecommendation(
  payload: SongRecommendationPayload,
): Promise<void> {
  await postJson({ action: "submitSongRecommendation", ...payload });
}

export async function listSongRecommendations(
  auth: string,
): Promise<SongRecommendation[]> {
  const response = await postJson<{ recommendations: SongRecommendation[] }>({
    action: "listSongRecommendations",
    auth,
  });
  return response.recommendations;
}
