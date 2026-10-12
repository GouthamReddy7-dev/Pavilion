import type { Player, PlayerFormData, Team, TeamFormData, TeamMatch, MatchData } from '../types';

const API_BASE = 'http://localhost:3000';

export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch(`${API_BASE}/players`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load players: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

export async function createPlayer(data: PlayerFormData): Promise<Player> {
  const response = await fetch(`${API_BASE}/add_player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create player: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function deletePlayer(playerId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/players/${playerId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete player: ${response.statusText}`);
  }
}

export async function fetchTeams(): Promise<Team[]> {
  const response = await fetch(`${API_BASE}/teams`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load teams: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

export async function createTeam(data: TeamFormData): Promise<Team> {
  const response = await fetch(`${API_BASE}/add_team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create team: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/teams/${teamId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete team: ${response.statusText}`);
  }
}

export async function createMatch(data: { team_name: string; opponent_team_name: string; custom_match_id?: string }): Promise<TeamMatch> {
  const response = await fetch(`${API_BASE}/create_match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create match: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function fetchMatches(): Promise<TeamMatch[]> {
  const response = await fetch(`${API_BASE}/matches`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to load matches: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

export async function fetchMatch(matchId: string): Promise<{ match: TeamMatch; match_data: MatchData[] }> {
  const response = await fetch(`${API_BASE}/match/${encodeURIComponent(matchId)}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to load match: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    match: result.match,
    match_data: result.match_data || [],
  };
}
export async function recordBall(data: {
  match_id: string;
  batting_team: string;
  bowling_team: string;
  striker_id?: string;
  non_striker_id?: string;
  bowler_id?: string;
  ball_type: 'runs' | 'out' | 'wide' | 'no_ball';
  runs?: number;
  dismissal_text?: string;
}): Promise<MatchData> {
  const response = await fetch(`${API_BASE}/record_ball`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to record ball: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function endInnings(data: {
  match_id: string;
  batting_team: string;
  runs: number;
  wickets: number;
  overs: number;
}): Promise<any> {
  const response = await fetch(`${API_BASE}/end_innings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to end innings: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

export async function endMatch(data: {
  match_id: string;
  winner: string;
  win_margin: string;
}): Promise<any> {
  const response = await fetch(`${API_BASE}/end_match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to end match: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}
