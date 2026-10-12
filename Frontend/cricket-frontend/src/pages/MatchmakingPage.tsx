import { useState, useEffect, type FC, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import type { Team, TeamMatch, MatchData, Player } from '../types';
import { fetchTeams, createMatch, fetchMatches, fetchMatch, fetchPlayers } from '../services/api';

export const MatchmakingPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode: 'matchmaking' (create match) or 'scorecard' (view match by ID)
  const initialMatchId = searchParams.get('matchId') || '';
  const [activeView, setActiveView] = useState<'matchmaking' | 'scorecard'>(
    initialMatchId ? 'scorecard' : 'matchmaking'
  );

  // Matchmaking Form State
  const [teams, setTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedTeamA, setSelectedTeamA] = useState<string>('');
  const [selectedTeamB, setSelectedTeamB] = useState<string>('');
  const [customMatchId, setCustomMatchId] = useState<string>('');
  const [recentMatches, setRecentMatches] = useState<TeamMatch[]>([]);
  const [isCreatingMatch, setIsCreatingMatch] = useState<boolean>(false);
  const [createdMatchResult, setCreatedMatchResult] = useState<TeamMatch | null>(null);

  // Scorecard View State
  const [inputMatchId, setInputMatchId] = useState<string>(initialMatchId);
  const [activeMatch, setActiveMatch] = useState<TeamMatch | null>(null);
  const [matchScorecards, setMatchScorecards] = useState<MatchData[]>([]);
  const [isLoadingMatch, setIsLoadingMatch] = useState<boolean>(false);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [inningsAlert, setInningsAlert] = useState<{ batting_team: string; runs: number; wickets: number; overs: number; target: number } | null>(null);
  const [matchResultAlert, setMatchResultAlert] = useState<{ winner: string; win_margin: string } | null>(null);

  // Scorecard Team Tab: Team A or Team B
  const [selectedTeamTab, setSelectedTeamTab] = useState<string>('');

  // General Notification
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Socket.IO live listener
  useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io('http://localhost:3000', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        setSocketConnected(false);
      });

      socket.on('score_update', (data: { match_id: string; scorecard: MatchData }) => {
        if (!data || !data.match_id) return;
        const currentMId = (activeMatch?.match_id || inputMatchId).toLowerCase();
        if (data.match_id.toLowerCase() === currentMId) {
          setMatchScorecards((prev) => {
            const idx = prev.findIndex(
              (sc) => sc.team_name.toLowerCase() === data.scorecard.team_name.toLowerCase()
            );
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data.scorecard;
              return updated;
            }
            return [...prev, data.scorecard];
          });
        }
      });

      socket.on('innings_ended', (data: any) => {
        if (!data || !data.match_id) return;
        const currentMId = (activeMatch?.match_id || inputMatchId).toLowerCase();
        if (data.match_id.toLowerCase() === currentMId) {
          setInningsAlert({
            batting_team: data.batting_team,
            runs: data.runs,
            wickets: data.wickets,
            overs: data.overs,
            target: data.target,
          });
          setActiveMatch((prev) => (prev ? { ...prev, target_runs: data.target, status: 'innings_break' } : prev));
          showToast('success', `Innings Break! ${data.batting_team} set a target of ${data.target} runs.`);
        }
      });

      socket.on('match_ended', (data: any) => {
        if (!data || !data.match_id) return;
        const currentMId = (activeMatch?.match_id || inputMatchId).toLowerCase();
        if (data.match_id.toLowerCase() === currentMId) {
          setMatchResultAlert({
            winner: data.winner,
            win_margin: data.win_margin,
          });
          setActiveMatch((prev) => (prev ? { ...prev, status: 'completed', winner: data.winner, win_margin: data.win_margin } : prev));
          showToast('success', `Match Completed! Winner: ${data.winner}`);
        }
      });
    } catch (err) {
      console.warn('Socket listener error in MatchmakingPage:', err);
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [activeMatch]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const urlMatchId = searchParams.get('matchId');
    if (urlMatchId) {
      setInputMatchId(urlMatchId);
      loadMatchDetails(urlMatchId);
      setActiveView('scorecard');
    }
  }, [searchParams]);

  const loadInitialData = async () => {
    try {
      const [teamsData, matchesData, playersData] = await Promise.all([
        fetchTeams().catch(() => []),
        fetchMatches().catch(() => []),
        fetchPlayers().catch(() => []),
      ]);
      setTeams(teamsData);
      setRecentMatches(matchesData);
      setAllPlayers(playersData);

      if (teamsData.length >= 2) {
        setSelectedTeamA(teamsData[0].team_name);
        setSelectedTeamB(teamsData[1].team_name);
      } else if (teamsData.length === 1) {
        setSelectedTeamA(teamsData[0].team_name);
      }
    } catch (err: unknown) {
      console.warn('Error loading matchmaking initial data:', err);
    }
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Submit Matchmaking Form
  const handleCreateMatch = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedTeamA || !selectedTeamB) {
      showToast('error', 'Please select both teams for the match.');
      return;
    }

    if (selectedTeamA === selectedTeamB) {
      showToast('error', 'A team cannot play against itself. Please choose two different teams.');
      return;
    }

    setIsCreatingMatch(true);
    try {
      const newMatch = await createMatch({
        team_name: selectedTeamA,
        opponent_team_name: selectedTeamB,
        custom_match_id: customMatchId.trim() || undefined,
      });

      setCreatedMatchResult(newMatch);
      showToast('success', `Match created successfully! Match ID: ${newMatch.match_id}`);

      // Refresh matches list
      const updatedMatches = await fetchMatches().catch(() => []);
      setRecentMatches(updatedMatches);

      // Pre-fill input match id
      setInputMatchId(newMatch.match_id);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create match';
      showToast('error', errorMsg);
    } finally {
      setIsCreatingMatch(false);
    }
  };

  // Load Match Details by Match ID (from MongoDB team_matches and matches_data)
  const loadMatchDetails = async (mId: string) => {
    const trimmed = mId.trim();
    if (!trimmed) {
      showToast('error', 'Please enter a valid Match ID.');
      return;
    }

    setIsLoadingMatch(true);
    setScorecardError(null);
    try {
      const result = await fetchMatch(trimmed);
      setActiveMatch(result.match);
      setMatchScorecards(result.match_data || []);

      // Default active team tab to Team A
      setSelectedTeamTab(result.match.team_name);

      // Update URL query
      setSearchParams({ matchId: trimmed });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Match not found in database';
      setScorecardError(errorMsg);
      setActiveMatch(null);
      setMatchScorecards([]);
    } finally {
      setIsLoadingMatch(false);
    }
  };

  const handleSearchScorecard = (e: FormEvent) => {
    e.preventDefault();
    if (!inputMatchId.trim()) {
      showToast('error', 'Please enter a Match ID');
      return;
    }
    loadMatchDetails(inputMatchId.trim());
  };

  // Resolve active scorecard for currently selected team tab
  const activeScorecard = matchScorecards.find(
    (sc) => sc.team_name.toLowerCase() === selectedTeamTab.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-[#080d0a] text-slate-100 pb-20">
      {/* Page Header */}
      <header className="sticky top-0 z-40 bg-[#0c140f]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <span className="material-symbols-outlined text-white text-xl">sports_cricket</span>
            </div>
            <div>
              <h1 className="font-display font-extrabold text-sm tracking-wide uppercase text-white leading-tight">
                Matchmaking & Scorecard
              </h1>
              <span className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase block">
                Fixture & Live Scores
              </span>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveView('matchmaking')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeView === 'matchmaking'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">handshake</span>
              <span>Matchmaking</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('scorecard')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeView === 'scorecard'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">scoreboard</span>
              <span>Scorecard</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 transition-all border ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/50'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {notification.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{notification.text}</span>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* ==================== VIEW 1: MATCHMAKING ==================== */}
        {activeView === 'matchmaking' && (
          <div className="space-y-6">
            {/* MATCH CREATION CARD */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0e1611] border border-white/10 shadow-xl space-y-5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                  Team Matchmaking
                </span>
                <h2 className="font-display font-extrabold text-lg text-white">
                  Schedule Match & Generate Match ID
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Choose two registered teams from the database to create a match fixture. Both teams will share a unique Match ID.
                </p>
              </div>

              {teams.length < 2 && (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-amber-400">info</span>
                  <span>
                    You need at least 2 teams created in MongoDB to set up matchmaking. Please create another team in the Team Builder.
                  </span>
                </div>
              )}

              <form onSubmit={handleCreateMatch} className="space-y-5">
                {/* Team Selection: Team A vs Team B */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                  {/* Team A Dropdown */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Team 1
                    </label>
                    <select
                      value={selectedTeamA}
                      onChange={(e) => setSelectedTeamA(e.target.value)}
                      className="w-full bg-[#080d0a] border border-white/15 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
                      required
                    >
                      <option value="" disabled>Select Team 1...</option>
                      {teams.map((t) => (
                        <option key={t._id} value={t.team_name}>
                          {t.team_name} ({t.team_players?.length || 0} players)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* VS Badge */}
                  <div className="md:col-span-1 flex items-center justify-center pt-3 md:pt-5">
                    <div className="w-10 h-10 rounded-full bg-black/60 border border-white/15 flex items-center justify-center font-display font-black text-xs text-emerald-400 shadow-md">
                      VS
                    </div>
                  </div>

                  {/* Team B Dropdown */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Opponent Team
                    </label>
                    <select
                      value={selectedTeamB}
                      onChange={(e) => setSelectedTeamB(e.target.value)}
                      className="w-full bg-[#080d0a] border border-white/15 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-all"
                      required
                    >
                      <option value="" disabled>Select Opponent Team...</option>
                      {teams.map((t) => (
                        <option key={t._id} value={t.team_name} disabled={t.team_name === selectedTeamA}>
                          {t.team_name} {t.team_name === selectedTeamA ? '(Already Selected)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional Custom Match ID Input */}
                <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <div className="w-full sm:w-72">
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                      Custom Match ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={customMatchId}
                      onChange={(e) => setCustomMatchId(e.target.value)}
                      placeholder="e.g. IND-WI-2026 (leave empty for auto ID)"
                      className="w-full bg-[#080d0a] border border-white/15 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingMatch || !selectedTeamA || !selectedTeamB || selectedTeamA === selectedTeamB}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold tracking-wide uppercase shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 self-end"
                  >
                    {isCreatingMatch ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        <span>Saving Match...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">sports_score</span>
                        <span>Create Match & Get ID</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* SUCCESS POPUP BANNER FOR GENERATED MATCH ID */}
              {createdMatchResult && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-white space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      Match Scheduled in MongoDB
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreatedMatchResult(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div>
                      <p className="text-sm font-extrabold text-white">
                        {createdMatchResult.team_name} <span className="text-emerald-400">vs</span> {createdMatchResult.opponent_team_name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-300">Generated Match ID:</span>
                        <code className="px-2.5 py-1 rounded bg-black/60 border border-emerald-500/30 font-mono text-sm font-extrabold text-emerald-400">
                          {createdMatchResult.match_id}
                        </code>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInputMatchId(createdMatchResult.match_id);
                        loadMatchDetails(createdMatchResult.match_id);
                        setActiveView('scorecard');
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md shrink-0"
                    >
                      <span>View Match Scorecard</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RECENT MATCHES FIXTURE LIST */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-extrabold text-sm text-white">
                  Created Matches in Database ({recentMatches.length})
                </h3>
                <span className="text-[11px] text-slate-400">Click any match to view its scorecard</span>
              </div>

              {recentMatches.length === 0 ? (
                <div className="py-10 text-center rounded-2xl bg-[#0e1611] border border-white/10 text-slate-400">
                  <p className="text-xs">No matches scheduled yet in team_matches collection.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recentMatches.map((m) => (
                    <div
                      key={m.match_id}
                      onClick={() => {
                        setInputMatchId(m.match_id);
                        loadMatchDetails(m.match_id);
                        setActiveView('scorecard');
                      }}
                      className="p-3.5 rounded-xl bg-[#0e1611] border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer flex items-center justify-between group shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] px-2 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-emerald-400 font-bold">
                            {m.match_id}
                          </code>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-white/5">
                            {m.status || 'scheduled'}
                          </span>
                        </div>
                        <h4 className="font-display font-bold text-sm text-white mt-1 group-hover:text-emerald-300 transition-colors">
                          {m.team_name} vs {m.opponent_team_name}
                        </h4>
                      </div>

                      <span className="material-symbols-outlined text-slate-500 group-hover:text-white transition-colors">
                        chevron_right
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== VIEW 2: SCORECARD VIEW ==================== */}
        {activeView === 'scorecard' && (
          <div className="space-y-5">
            {/* MATCH ID INPUT BAR */}
            <div className="p-4 rounded-2xl bg-[#0e1611] border border-white/10 shadow-lg">
              <form onSubmit={handleSearchScorecard} className="flex flex-col sm:flex-row gap-2.5 items-center">
                <div className="relative flex-1 w-full">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                    search
                  </span>
                  <input
                    type="text"
                    value={inputMatchId}
                    onChange={(e) => setInputMatchId(e.target.value)}
                    placeholder="Enter Match ID (e.g. M-1029, IND-WI-2026)..."
                    className="w-full bg-[#080d0a] border border-white/15 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none font-mono font-medium"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoadingMatch}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  {isLoadingMatch ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">search</span>
                      <span>Fetch Scorecard</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Error Message */}
            {scorecardError && (
              <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2.5">
                <span className="material-symbols-outlined text-rose-400 text-base">error</span>
                <span>{scorecardError}</span>
              </div>
            )}

            {/* TOTAL LIVE SCORE OF BOTH TEAMS (BELOW SEARCH BAR, ABOVE MATCH TABLE) */}
            {activeMatch && (() => {
              const teamAName = activeMatch.team_name;
              const teamBName = activeMatch.opponent_team_name;

              const scA = matchScorecards.find(
                (sc) => sc.team_name.toLowerCase() === teamAName.toLowerCase()
              );
              const scB = matchScorecards.find(
                (sc) => sc.team_name.toLowerCase() === teamBName.toLowerCase()
              );

              const runsA = scA?.runs ?? 0;
              const wktsA = scA?.wickets ?? 0;
              const oversA = scA?.overs ?? 0;

              const runsB = scB?.runs ?? 0;
              const wktsB = scB?.wickets ?? 0;
              const oversB = scB?.overs ?? 0;

              const getCrr = (r: number, ov: number) => {
                const whole = Math.floor(ov);
                const rem = Math.round((ov - whole) * 10);
                const balls = whole * 6 + rem;
                return balls > 0 ? ((r / balls) * 6).toFixed(2) : '0.00';
              };

              const crrA = getCrr(runsA, oversA);
              const crrB = getCrr(runsB, oversB);

              return (
                <div className="bg-gradient-to-r from-[#0d1611] via-[#0f1f16] to-[#0d1611] border border-emerald-500/30 rounded-2xl p-5 shadow-2xl space-y-4">
                  {/* Status header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        TOTAL LIVE MATCH SCORE
                      </span>
                      <code className="text-xs font-mono font-bold text-amber-400 bg-black/40 px-2 py-0.5 rounded border border-white/10">
                        {activeMatch.match_id}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeMatch.winner ? (
                        <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center gap-1">
                          <span>🏆</span>
                          <span>{activeMatch.winner} WON</span>
                        </span>
                      ) : activeMatch.status === 'innings_break' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-extrabold uppercase">
                          INNINGS BREAK
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                          {activeMatch.status || 'Live in Progress'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Both Teams Scores Side by Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Team A Card */}
                    <div
                      onClick={() => setSelectedTeamTab(teamAName)}
                      className={`p-4 rounded-xl transition-all cursor-pointer border ${
                        selectedTeamTab.toLowerCase() === teamAName.toLowerCase()
                          ? 'bg-emerald-950/60 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30'
                          : 'bg-black/30 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-base text-white tracking-wide flex items-center gap-2">
                          <span className="text-emerald-400">🏏</span>
                          <span>{teamAName}</span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {selectedTeamTab.toLowerCase() === teamAName.toLowerCase() ? 'Viewing' : 'Team A'}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-white font-display">
                          {runsA}
                          <span className="text-rose-400 font-normal">/{wktsA}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-300 font-mono">
                          ({oversA} ov)
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                        <span>CRR: <strong className="text-slate-200">{crrA}</strong></span>
                        {activeMatch.target_runs && activeMatch.target_runs > 0 && selectedTeamTab.toLowerCase() === teamAName.toLowerCase() && (
                          <span className="text-amber-300 font-semibold">
                            Target: {activeMatch.target_runs}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Team B Card */}
                    <div
                      onClick={() => setSelectedTeamTab(teamBName)}
                      className={`p-4 rounded-xl transition-all cursor-pointer border ${
                        selectedTeamTab.toLowerCase() === teamBName.toLowerCase()
                          ? 'bg-emerald-950/60 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30'
                          : 'bg-black/30 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-base text-white tracking-wide flex items-center gap-2">
                          <span className="text-sky-400">🏏</span>
                          <span>{teamBName}</span>
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                          {selectedTeamTab.toLowerCase() === teamBName.toLowerCase() ? 'Viewing' : 'Team B'}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-white font-display">
                          {runsB}
                          <span className="text-rose-400 font-normal">/{wktsB}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-300 font-mono">
                          ({oversB} ov)
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                        <span>CRR: <strong className="text-slate-200">{crrB}</strong></span>
                        {activeMatch.target_runs && activeMatch.target_runs > 0 && (
                          <span className="text-amber-300 font-semibold">
                            Target: {activeMatch.target_runs}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Innings Break Notification Banner */}
                  {inningsAlert && (
                    <div className="p-3.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between shadow-lg">
                      <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-amber-400 text-xl">flag</span>
                        <span>
                          <strong>Innings Break!</strong> {inningsAlert.batting_team} finished at {inningsAlert.runs}/{inningsAlert.wickets} ({inningsAlert.overs} ov). Target: <strong className="text-white underline">{inningsAlert.target} runs</strong>.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInningsAlert(null)}
                        className="text-amber-400 hover:text-white"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  )}

                  {/* Match Ended Celebration Banner */}
                  {(activeMatch.winner || matchResultAlert) && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-amber-950/80 border-2 border-amber-500 text-white text-xs shadow-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">🏆</span>
                        <div>
                          <h4 className="font-extrabold text-sm text-amber-300 uppercase tracking-wider">
                            Match Completed!
                          </h4>
                          <p className="text-xs text-slate-200 font-semibold mt-0.5">
                            Winner: <strong className="text-white text-sm">{activeMatch.winner || matchResultAlert?.winner}</strong>
                            {(activeMatch.win_margin || matchResultAlert?.win_margin) && (
                              <span className="text-amber-200 font-normal"> ({activeMatch.win_margin || matchResultAlert?.win_margin})</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-lg bg-amber-500 text-black font-black text-xs uppercase tracking-wider shadow">
                        FINAL RESULT
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SCORECARD DISPLAY (MATCHING THE SCREENSHOT) */}
            {activeMatch && (
              <div className="rounded-2xl bg-[#0f1418] border border-white/10 shadow-2xl overflow-hidden">
                {/* MATCH HEADER INFO BAR */}
                <div className="px-5 py-3.5 bg-black/40 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Match ID:
                    </span>
                    <code className="font-mono text-sm font-extrabold text-white px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      {activeMatch.match_id}
                    </code>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        socketConnected
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                          socketConnected ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      {socketConnected ? 'LIVE SOCKET' : 'CONNECTING'}
                    </span>
                    <span className="text-xs text-slate-400">• {activeMatch.status}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-300 font-semibold hidden sm:block">
                      <span>{activeMatch.team_name}</span>
                      <span className="text-slate-500 mx-1.5">vs</span>
                      <span>{activeMatch.opponent_team_name}</span>
                    </div>

                    <Link
                      to={`/umpire?matchId=${activeMatch.match_id}`}
                      className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">sports</span>
                      <span>Umpire Console</span>
                    </Link>
                  </div>
                </div>

                {/* TWO TEAM TABS SIDE-BY-SIDE (EXACTLY AS SCREENSHOT) */}
                <div className="bg-[#12181d] border-b border-white/10 flex">
                  <button
                    type="button"
                    onClick={() => setSelectedTeamTab(activeMatch.team_name)}
                    className={`flex-1 py-3 text-center text-sm font-bold transition-all relative ${
                      selectedTeamTab.toLowerCase() === activeMatch.team_name.toLowerCase()
                        ? 'text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{activeMatch.team_name}</span>
                    {selectedTeamTab.toLowerCase() === activeMatch.team_name.toLowerCase() && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-sm" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTeamTab(activeMatch.opponent_team_name)}
                    className={`flex-1 py-3 text-center text-sm font-bold transition-all relative ${
                      selectedTeamTab.toLowerCase() === activeMatch.opponent_team_name.toLowerCase()
                        ? 'text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{activeMatch.opponent_team_name}</span>
                    {selectedTeamTab.toLowerCase() === activeMatch.opponent_team_name.toLowerCase() && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-sm" />
                    )}
                  </button>
                </div>

                {/* TEAM SCORE SUMMARY BAR */}
                {activeScorecard && (
                  <div className="px-5 py-3 bg-[#171f25]/50 border-b border-white/5 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400">Total Score: </span>
                      <strong className="text-base text-white font-mono">
                        {activeScorecard.runs ?? 0} / {activeScorecard.wickets ?? 0}
                      </strong>
                      <span className="text-slate-400 ml-1.5 font-mono">
                        ({activeScorecard.overs ?? 0} ov)
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold uppercase">
                      Innings: {activeScorecard.team_name}
                    </span>
                  </div>
                )}

                {/* SCORECARD BATTING TABLE (SCREENSHOT REPLICATION) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 text-xs font-semibold">
                        <th className="py-3 px-4 sm:px-6 font-medium text-sky-400">Batting</th>
                        <th className="py-3 px-3 text-right font-medium">R</th>
                        <th className="py-3 px-3 text-right font-medium">B</th>
                        <th className="py-3 px-3 text-right font-medium">4s</th>
                        <th className="py-3 px-3 text-right font-medium">6s</th>
                        <th className="py-3 px-4 sm:px-6 text-right font-medium">S/R</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activeScorecard && activeScorecard.players_stats && activeScorecard.players_stats.length > 0 ? (
                        activeScorecard.players_stats.map((pStat, index) => {
                          const playerDoc =
                            typeof pStat.player_id === 'object' && pStat.player_id !== null
                              ? (pStat.player_id as Player)
                              : allPlayers.find((ap) => ap._id === pStat.player_id);

                          const playerName = playerDoc?.name || `Player #${index + 1}`;
                          const playerRole = playerDoc?.role;
                          const profileImg = playerDoc?.profile_img;
                          const isWk = playerRole === 'Wicket-Keeper Batsman';

                          return (
                            <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                              {/* Batting Player Column with Avatar & Dismissal text */}
                              <td className="py-3 px-4 sm:px-6">
                                <div className="flex items-center gap-3">
                                  {/* Circular Avatar */}
                                  <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white overflow-hidden shrink-0">
                                    {profileImg ? (
                                      <img
                                        src={profileImg}
                                        alt={playerName}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <span className="material-symbols-outlined text-lg text-slate-400">person</span>
                                    )}
                                  </div>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-sm text-white truncate">{playerName}</span>
                                      {isWk && (
                                        <span className="text-[11px] text-slate-400 font-normal">(Wk)</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                                      <span className="text-[10px] text-slate-500 font-mono">⌄</span>
                                      <span>{pStat.dismissal_info || 'not out'}</span>
                                    </p>
                                  </div>
                                </div>
                              </td>

                              {/* Runs (R) */}
                              <td className="py-3 px-3 text-right font-display font-bold text-sm text-white">
                                {pStat.runs ?? 0}
                              </td>

                              {/* Balls (B) */}
                              <td className="py-3 px-3 text-right text-xs text-slate-300">
                                {pStat.balls ?? 0}
                              </td>

                              {/* Fours (4s) */}
                              <td className="py-3 px-3 text-right text-xs text-slate-300">
                                {pStat.fours ?? 0}
                              </td>

                              {/* Sixes (6s) */}
                              <td className="py-3 px-3 text-right text-xs text-slate-300">
                                {pStat.sixes ?? 0}
                              </td>

                              {/* Strike Rate (S/R) */}
                              <td className="py-3 px-4 sm:px-6 text-right font-mono text-xs text-slate-300">
                                {pStat.strike_rate !== undefined
                                  ? Number(pStat.strike_rate).toFixed(1)
                                  : pStat.balls && pStat.balls > 0
                                  ? (((pStat.runs || 0) / pStat.balls) * 100).toFixed(1)
                                  : '0.0'}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <div className="max-w-sm mx-auto space-y-1.5">
                              <span className="material-symbols-outlined text-2xl text-slate-500">
                                pending_actions
                              </span>
                              <p className="text-xs text-slate-300 font-medium">
                                No scorecard records for {selectedTeamTab} yet.
                              </p>
                              <p className="text-[11px] text-slate-500 leading-relaxed">
                                Data for this match will appear here once scoring is recorded from the scoring console. No placeholder data is displayed.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* SCORECARD BOWLING TABLE (MATCHING SCREENSHOT) */}
                {(() => {
                  const opponentTeamName = activeMatch
                    ? selectedTeamTab.toLowerCase() === activeMatch.team_name.toLowerCase()
                      ? activeMatch.opponent_team_name
                      : activeMatch.team_name
                    : '';

                  const opponentTeamObj = teams.find(
                    (t) => t.team_name.toLowerCase() === opponentTeamName.toLowerCase()
                  );

                  const opponentSquadPlayers: Player[] = opponentTeamObj
                    ? opponentTeamObj.team_players
                        .map((p) => {
                          if (typeof p === 'object' && p !== null && '_id' in p) return p as Player;
                          return allPlayers.find((ap) => String(ap._id) === String(p));
                        })
                        .filter((p): p is Player => Boolean(p))
                    : [];

                  const recorded = activeScorecard?.bowlers_stats || [];
                  const displayedBowlersList: Array<{
                    id: string;
                    name: string;
                    profileImg?: string;
                    role?: string;
                    overs: number | string;
                    maidens: number;
                    runs: number;
                    wickets: number;
                    economy: string;
                  }> = [];

                  const recordedIds = new Set<string>();

                  // Add all bowlers who have recorded figures
                  for (const b of recorded) {
                    const rawPId =
                      b.player_id && typeof b.player_id === 'object' && '_id' in b.player_id
                        ? String((b.player_id as any)._id)
                        : String(b.player_id || '');

                    const playerObj =
                      b.player_id && typeof b.player_id === 'object' && 'name' in b.player_id
                        ? (b.player_id as Player)
                        : allPlayers.find((p) => String(p._id) === rawPId);

                    if (rawPId) recordedIds.add(rawPId);
                    if (playerObj?._id) recordedIds.add(String(playerObj._id));

                    const balls = Number(b.balls_bowled) || 0;
                    const wholeO = Math.floor(balls / 6);
                    const remB = balls % 6;
                    const calculatedOvers =
                      b.overs !== undefined && b.overs !== null && Number(b.overs) > 0
                        ? Number(b.overs).toFixed(1)
                        : balls > 0
                        ? `${wholeO}.${remB}`
                        : '0.0';

                    const runsC = Number(b.runs) || 0;
                    const wkts = Number(b.wickets) || 0;
                    const calculatedEcon =
                      b.economy !== undefined && b.economy !== null && Number(b.economy) > 0
                        ? Number(b.economy).toFixed(2)
                        : balls > 0
                        ? ((runsC / (balls / 6))).toFixed(2)
                        : '0.00';

                    displayedBowlersList.push({
                      id: rawPId || playerObj?.name || Math.random().toString(),
                      name: playerObj?.name || 'Bowler',
                      profileImg: playerObj?.profile_img,
                      role: playerObj?.role,
                      overs: calculatedOvers,
                      maidens: b.maidens ?? 0,
                      runs: runsC,
                      wickets: wkts,
                      economy: calculatedEcon,
                    });
                  }

                  // Also include remaining bowlers from the opponent team squad who haven't bowled yet
                  for (const sp of opponentSquadPlayers) {
                    const spId = String(sp._id);
                    if (!recordedIds.has(spId)) {
                      displayedBowlersList.push({
                        id: spId,
                        name: sp.name,
                        profileImg: sp.profile_img,
                        role: sp.role,
                        overs: '0.0',
                        maidens: 0,
                        runs: 0,
                        wickets: 0,
                        economy: '0.00',
                      });
                    }
                  }

                  return (
                    <div className="border-t border-white/10 mt-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/10 text-slate-400 text-xs font-semibold">
                              <th className="py-3 px-4 sm:px-6 font-medium text-amber-400">
                                Bowling ({opponentTeamName || 'Opponent'})
                              </th>
                              <th className="py-3 px-3 text-right font-medium">O</th>
                              <th className="py-3 px-3 text-right font-medium">M</th>
                              <th className="py-3 px-3 text-right font-medium">R</th>
                              <th className="py-3 px-3 text-right font-medium">W</th>
                              <th className="py-3 px-4 sm:px-6 text-right font-medium">Econ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {displayedBowlersList.length > 0 ? (
                              displayedBowlersList.map((bowler) => (
                                <tr key={bowler.id} className="hover:bg-white/[0.02] transition-colors">
                                  {/* Bowler Name & Avatar */}
                                  <td className="py-3 px-4 sm:px-6">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white overflow-hidden shrink-0">
                                        {bowler.profileImg ? (
                                          <img
                                            src={bowler.profileImg}
                                            alt={bowler.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.currentTarget as HTMLElement).style.display = 'none';
                                            }}
                                          />
                                        ) : (
                                          <span className="material-symbols-outlined text-lg text-amber-400">
                                            sports_baseball
                                          </span>
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-bold text-sm text-white truncate">
                                            {bowler.name}
                                          </span>
                                          {bowler.role && (
                                            <span className="text-[10px] text-slate-500 font-normal">
                                              ({bowler.role})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Overs (O) */}
                                  <td className="py-3 px-3 text-right font-mono text-xs text-slate-200">
                                    {bowler.overs}
                                  </td>

                                  {/* Maidens (M) */}
                                  <td className="py-3 px-3 text-right font-mono text-xs text-slate-300">
                                    {bowler.maidens}
                                  </td>

                                  {/* Runs Conceded (R) */}
                                  <td className="py-3 px-3 text-right font-display font-bold text-sm text-white">
                                    {bowler.runs}
                                  </td>

                                  {/* Wickets Taken (W) */}
                                  <td className="py-3 px-3 text-right font-display font-bold text-sm text-emerald-400">
                                    {bowler.wickets}
                                  </td>

                                  {/* Economy (Econ) */}
                                  <td className="py-3 px-4 sm:px-6 text-right font-mono text-xs text-slate-300">
                                    {bowler.economy}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                                  No bowlers registered for {opponentTeamName || 'opponents'} yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
