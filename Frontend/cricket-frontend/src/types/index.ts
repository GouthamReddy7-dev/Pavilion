export interface Player {
  _id: string;
  name: string;
  jersey_number: number;
  role: 'Batter' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper Batsman';
  handed: 'Right Handed' | 'Left Handed';
  bowler_type?: string;
  profile_img?: string;

  // Career Statistics (Initialised to 0)
  total_matches: number;
  total_runs: number;
  highest_runs: number;
  total_four: number;
  total_six: number;
  total_fifty: number;
  total_centaury: number;

  total_wickets: number;
  balls_bowled: number;
  runs_conceded: number;

  total_catches: number;
  total_stumpings: number;

  createdAt?: string;
  updatedAt?: string;
}

export type PlayerFormData = Omit<Player, '_id' | 'total_matches' | 'total_runs' | 'highest_runs' | 'total_four' | 'total_six' | 'total_fifty' | 'total_centaury' | 'total_wickets' | 'balls_bowled' | 'runs_conceded' | 'total_catches' | 'total_stumpings' | 'createdAt' | 'updatedAt'>;

export interface Team {
  _id: string;
  team_name: string;
  team_players: (string | Player)[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamFormData {
  team_name: string;
  team_players: string[];
}

export interface TeamMatch {
  _id?: string;
  match_id: string;
  team_name: string;
  opponent_team_name: string;
  status?: string;
  winner?: string;
  win_margin?: string;
  target_runs?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlayerMatchStats {
  player_id: string | Player;
  dismissal_info?: string;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  strike_rate?: number;
}

export interface BowlerMatchStats {
  player_id: string | Player;
  overs?: number;
  balls_bowled?: number;
  maidens?: number;
  runs?: number;
  wickets?: number;
  economy?: number;
}

export interface MatchData {
  _id?: string;
  match_id: string;
  team_name: string;
  opponent_name: string;
  runs?: number;
  wickets?: number;
  overs?: number;
  players_stats?: PlayerMatchStats[];
  bowlers_stats?: BowlerMatchStats[];
  createdAt?: string;
  updatedAt?: string;
}


