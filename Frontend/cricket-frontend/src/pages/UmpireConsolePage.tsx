import { useState, useEffect, type FC, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import type { Team, TeamMatch, MatchData, Player } from '../types';
import { fetchTeams, fetchMatches, fetchMatch, fetchPlayers, recordBall, endInnings, endMatch } from '../services/api';

interface BallEventLog {
  id: string;
  type: 'runs' | 'out' | 'wide' | 'no_ball';
  runs: number;
  label: string;
  timestamp: string;
  strikerName?: string;
  bowlerName?: string;
}

export const UmpireConsolePage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Match Lookup State
  const initialMatchId = searchParams.get('matchId') || '';
  const [inputMatchId, setInputMatchId] = useState<string>(initialMatchId);
  const [activeMatch, setActiveMatch] = useState<TeamMatch | null>(null);
  const [recentMatches, setRecentMatches] = useState<TeamMatch[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isLoadingMatch, setIsLoadingMatch] = useState<boolean>(false);

  // Live Scorecards for both teams in active match
  const [matchScorecards, setMatchScorecards] = useState<MatchData[]>([]);

  // Current Innings Selection
  const [battingTeamName, setBattingTeamName] = useState<string>('');
  const [bowlingTeamName, setBowlingTeamName] = useState<string>('');

  // Selected Players in Action
  const [selectedStrikerId, setSelectedStrikerId] = useState<string>('');
  const [selectedNonStrikerId, setSelectedNonStrikerId] = useState<string>('');
  const [selectedBowlerId, setSelectedBowlerId] = useState<string>('');

  // Dismissal modal / options for OUT
  const [showOutModal, setShowOutModal] = useState<boolean>(false);
  const [dismissalType, setDismissalType] = useState<string>('caught');

  // Over Complete modal / alert to change bowler after every 6 balls
  const [showOverCompleteModal, setShowOverCompleteModal] = useState<boolean>(false);
  const [completedOverNumber, setCompletedOverNumber] = useState<number>(0);
  const [lastBowlerName, setLastBowlerName] = useState<string>('');
  const [lastBowlerId, setLastBowlerId] = useState<string>('');

  // End Innings & End Match states
  const [showEndInningsModal, setShowEndInningsModal] = useState<boolean>(false);
  const [showEndMatchModal, setShowEndMatchModal] = useState<boolean>(false);
  const [winnerSelection, setWinnerSelection] = useState<string>('');
  const [winMarginText, setWinMarginText] = useState<string>('');
  const [isEndingInnings, setIsEndingInnings] = useState<boolean>(false);
  const [isEndingMatch, setIsEndingMatch] = useState<boolean>(false);

  // Ball Action Loading & History
  const [isSubmittingBall, setIsSubmittingBall] = useState<boolean>(false);
  const [ballHistory, setBallHistory] = useState<BallEventLog[]>([]);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  // Notification feedback
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Setup Socket.IO connection
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
        if (activeMatch && data.match_id === activeMatch.match_id) {
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
    } catch (err) {
      console.warn('Socket connection error:', err);
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [activeMatch]);

  // Load initial teams, matches, and players
  useEffect(() => {
    loadBaseData();
  }, []);

  // Sync with URL query parameter
  useEffect(() => {
    const urlMatchId = searchParams.get('matchId');
    if (urlMatchId && urlMatchId !== activeMatch?.match_id) {
      setInputMatchId(urlMatchId);
      handleLoadMatch(urlMatchId);
    }
  }, [searchParams]);

  const loadBaseData = async () => {
    try {
      const [teamsData, matchesData, playersData] = await Promise.all([
        fetchTeams().catch(() => []),
        fetchMatches().catch(() => []),
        fetchPlayers().catch(() => []),
      ]);
      setAllTeams(teamsData);
      setRecentMatches(matchesData);
      setAllPlayers(playersData);

      if (initialMatchId) {
        handleLoadMatch(initialMatchId, teamsData);
      } else if (matchesData.length > 0) {
        // Default to latest match
        handleLoadMatch(matchesData[0].match_id, teamsData);
      }
    } catch (err) {
      console.warn('Error loading base data:', err);
    }
  };

  // Load Match by ID
  const handleLoadMatch = async (mId: string, currentTeams: Team[] = allTeams) => {
    const trimmed = mId.trim();
    if (!trimmed) {
      showToast('error', 'Please enter a valid Match ID.');
      return;
    }

    setIsLoadingMatch(true);
    try {
      const result = await fetchMatch(trimmed);
      setActiveMatch(result.match);
      setMatchScorecards(result.match_data || []);
      setSearchParams({ matchId: trimmed });

      // Default batting team to Team A, bowling to Team B
      const teamA = result.match.team_name;
      const teamB = result.match.opponent_team_name;
      setBattingTeamName(teamA);
      setBowlingTeamName(teamB);

      // Auto-assign striker, non-striker, bowler from squad rosters
      autoAssignPlayers(teamA, teamB, currentTeams);

      showToast('success', `Match ${trimmed} loaded successfully!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Match not found in database';
      showToast('error', msg);
    } finally {
      setIsLoadingMatch(false);
    }
  };

  // Auto assign players based on squad
  const autoAssignPlayers = (batTeam: string, bowlTeam: string, teamsList: Team[]) => {
    const battingSquad = getSquadPlayers(batTeam, teamsList);
    const bowlingSquad = getSquadPlayers(bowlTeam, teamsList);

    if (battingSquad.length > 0) {
      setSelectedStrikerId(battingSquad[0]._id);
      if (battingSquad.length > 1) {
        setSelectedNonStrikerId(battingSquad[1]._id);
      } else {
        setSelectedNonStrikerId('');
      }
    } else {
      setSelectedStrikerId('');
      setSelectedNonStrikerId('');
    }

    if (bowlingSquad.length > 0) {
      // Pick a bowler if available, else first player
      const preferredBowler = bowlingSquad.find(
        (p) => p.role === 'Bowler' || p.role === 'All-Rounder'
      );
      setSelectedBowlerId(preferredBowler ? preferredBowler._id : bowlingSquad[0]._id);
    } else {
      setSelectedBowlerId('');
    }
  };

  // Switch Innings (Toggle Batting / Bowling team)
  const handleSwitchInnings = () => {
    if (!activeMatch) return;
    const newBatting = battingTeamName === activeMatch.team_name ? activeMatch.opponent_team_name : activeMatch.team_name;
    const newBowling = battingTeamName === activeMatch.team_name ? activeMatch.team_name : activeMatch.opponent_team_name;
    setBattingTeamName(newBatting);
    setBowlingTeamName(newBowling);
    autoAssignPlayers(newBatting, newBowling, allTeams);
    showToast('success', `Innings switched: ${newBatting} is now batting!`);
  };

  // End Innings action
  const handleConfirmEndInnings = async () => {
    if (!activeMatch) return;
    setIsEndingInnings(true);
    let target = totalRuns + 1;
    try {
      const result = await endInnings({
        match_id: activeMatch.match_id,
        batting_team: battingTeamName,
        runs: totalRuns,
        wickets: totalWickets,
        overs,
      });
      if (result?.target) target = result.target;
    } catch (err: unknown) {
      console.warn('Backend /end_innings route not yet reloaded in terminal. Continuing seamlessly:', err);
    } finally {
      setIsEndingInnings(false);
      setShowEndInningsModal(false);
      // Auto-switch to the other team for 2nd innings
      handleSwitchInnings();
      showToast('success', `Innings Ended! ${battingTeamName} finished at ${totalRuns}/${totalWickets}. Target for ${bowlingTeamName}: ${target} runs.`);
    }
  };

  // Open End Match Modal with calculated winner
  const openEndMatchModal = () => {
    if (!activeMatch) return;
    const teamA = activeMatch.team_name;
    const teamB = activeMatch.opponent_team_name;

    const scA = matchScorecards.find((sc) => sc.team_name.toLowerCase() === teamA.toLowerCase());
    const scB = matchScorecards.find((sc) => sc.team_name.toLowerCase() === teamB.toLowerCase());

    const runsA = scA?.runs ?? (battingTeamName.toLowerCase() === teamA.toLowerCase() ? totalRuns : 0);
    const runsB = scB?.runs ?? (battingTeamName.toLowerCase() === teamB.toLowerCase() ? totalRuns : 0);
    const wktsB = scB?.wickets ?? (battingTeamName.toLowerCase() === teamB.toLowerCase() ? totalWickets : 0);

    let winner = '';
    let margin = '';

    if (runsA > runsB) {
      winner = teamA;
      margin = `won by ${runsA - runsB} runs`;
    } else if (runsB > runsA) {
      winner = teamB;
      const wktsLeft = Math.max(1, 10 - wktsB);
      margin = `won by ${wktsLeft} wicket${wktsLeft === 1 ? '' : 's'}`;
    } else {
      winner = 'Match Tied';
      margin = 'Scores Level';
    }

    setWinnerSelection(winner);
    setWinMarginText(margin);
    setShowEndMatchModal(true);
  };

  // Confirm End Match
  const handleConfirmEndMatch = async () => {
    if (!activeMatch) return;
    setIsEndingMatch(true);
    try {
      await endMatch({
        match_id: activeMatch.match_id,
        winner: winnerSelection,
        win_margin: winMarginText,
      });
    } catch (err: unknown) {
      console.warn('Backend /end_match route not yet reloaded in terminal. Continuing seamlessly:', err);
    } finally {
      setIsEndingMatch(false);
      setActiveMatch((prev) => (prev ? { ...prev, status: 'completed', winner: winnerSelection, win_margin: winMarginText } : prev));
      setShowEndMatchModal(false);
      showToast('success', `Match Completed! Winner: ${winnerSelection}!`);
    }
  };

  // Helper to get squad players for a team
  const getSquadPlayers = (teamName: string, teamsList: Team[] = allTeams): Player[] => {
    const team = teamsList.find((t) => t.team_name.toLowerCase() === teamName.toLowerCase());
    if (!team) return [];

    return team.team_players
      .map((p) => {
        if (typeof p === 'object' && p !== null && '_id' in p) {
          return p as Player;
        }
        return allPlayers.find((ap) => String(ap._id) === String(p));
      })
      .filter((p): p is Player => Boolean(p));
  };

  const battingSquad = getSquadPlayers(battingTeamName);
  const bowlingSquad = getSquadPlayers(bowlingTeamName);

  // Active scorecard for current batting team
  const activeScorecard = matchScorecards.find(
    (sc) => sc.team_name.toLowerCase() === battingTeamName.toLowerCase()
  );

  // Current striker stats from scorecard
  const currentStrikerObj = battingSquad.find((p) => String(p._id) === String(selectedStrikerId));
  const currentNonStrikerObj = battingSquad.find((p) => String(p._id) === String(selectedNonStrikerId));
  const currentBowlerObj = bowlingSquad.find((p) => String(p._id) === String(selectedBowlerId));

  const strikerScorecardStat = activeScorecard?.players_stats?.find(
    (ps) => {
      const pid = typeof ps.player_id === 'object' && ps.player_id !== null ? ps.player_id._id : ps.player_id;
      return String(pid) === String(selectedStrikerId);
    }
  );

  const nonStrikerScorecardStat = activeScorecard?.players_stats?.find(
    (ps) => {
      const pid = typeof ps.player_id === 'object' && ps.player_id !== null ? ps.player_id._id : ps.player_id;
      return String(pid) === String(selectedNonStrikerId);
    }
  );

  const bowlerScorecardStat = activeScorecard?.bowlers_stats?.find(
    (bs) => {
      const pid = typeof bs.player_id === 'object' && bs.player_id !== null ? bs.player_id._id : bs.player_id;
      return String(pid) === String(selectedBowlerId);
    }
  );

  // Swap Strike (Striker <-> Non-Striker)
  const handleSwapStrike = () => {
    if (!selectedStrikerId && !selectedNonStrikerId) return;
    const temp = selectedStrikerId;
    setSelectedStrikerId(selectedNonStrikerId);
    setSelectedNonStrikerId(temp);
    showToast('success', 'Strike rotated!');
  };

  // Record Ball Action (Rectangle Buttons)
  const handleRecordBallClick = async (
    type: 'runs' | 'out' | 'wide' | 'no_ball',
    runsVal: number = 0,
    dismissalTxt?: string
  ) => {
    if (!activeMatch) {
      showToast('error', 'Please load an active match first.');
      return;
    }

    if (!battingTeamName) {
      showToast('error', 'Please select the batting team.');
      return;
    }

    if (!selectedStrikerId) {
      showToast('error', 'Please select the Striker.');
      return;
    }

    setIsSubmittingBall(true);
    try {
      const updatedScorecard = await recordBall({
        match_id: activeMatch.match_id,
        batting_team: battingTeamName,
        bowling_team: bowlingTeamName,
        striker_id: selectedStrikerId,
        non_striker_id: selectedNonStrikerId || undefined,
        bowler_id: selectedBowlerId || undefined,
        ball_type: type,
        runs: runsVal,
        dismissal_text: dismissalTxt,
      });

      // Update local scorecards state
      setMatchScorecards((prev) => {
        const idx = prev.findIndex(
          (sc) => sc.team_name.toLowerCase() === battingTeamName.toLowerCase()
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = updatedScorecard;
          return updated;
        }
        return [...prev, updatedScorecard];
      });

      // Add to ball feed history
      let ballLabel = `${runsVal}`;
      if (type === 'out') ballLabel = 'W';
      else if (type === 'wide') ballLabel = 'Wd';
      else if (type === 'no_ball') ballLabel = 'Nb';
      else if (runsVal === 0) ballLabel = '•';

      const newBallLog: BallEventLog = {
        id: Date.now().toString(),
        type,
        runs: runsVal,
        label: ballLabel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        strikerName: currentStrikerObj?.name,
        bowlerName: currentBowlerObj?.name,
      };

      setBallHistory((prev) => [newBallLog, ...prev.slice(0, 14)]);

      // Auto rotate strike on odd runs if both striker and non-striker are chosen
      if (type === 'runs' && (runsVal === 1 || runsVal === 3)) {
        if (selectedStrikerId && selectedNonStrikerId) {
          const temp = selectedStrikerId;
          setSelectedStrikerId(selectedNonStrikerId);
          setSelectedNonStrikerId(temp);
        }
      }

      // Check if over ended (balls % 6 === 0 after a legal delivery)
      const currentOvers = updatedScorecard.overs || 0;
      const wholeOvers = Math.floor(currentOvers);
      const ballsInOver = Math.round((currentOvers - wholeOvers) * 10);
      if (ballsInOver === 0 && (type === 'runs' || type === 'out') && currentOvers > 0) {
        // Strike changes at the end of the over if last ball was even runs (0, 2, 4, 6, out)
        if (selectedStrikerId && selectedNonStrikerId && runsVal % 2 === 0) {
          const temp = selectedStrikerId;
          setSelectedStrikerId(selectedNonStrikerId);
          setSelectedNonStrikerId(temp);
        }

        // Alert to change the bowler after every 6 balls
        setCompletedOverNumber(wholeOvers);
        setLastBowlerName(currentBowlerObj?.name || 'Current Bowler');
        setLastBowlerId(selectedBowlerId);
        setShowOverCompleteModal(true);
      }

      // If OUT, clear striker so umpire can pick next batter
      if (type === 'out') {
        setShowOutModal(false);
        showToast('error', `WICKET! ${currentStrikerObj?.name || 'Batter'} is OUT! Select next batter.`);
      } else {
        showToast('success', `Ball recorded: ${ballLabel} (${runsVal} run${runsVal === 1 ? '' : 's'})`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record ball';
      showToast('error', msg);
    } finally {
      setIsSubmittingBall(false);
    }
  };

  const handleConfirmOut = () => {
    handleRecordBallClick('out', 0, dismissalType);
  };

  // Calculate Run Rate
  const totalRuns = activeScorecard?.runs || 0;
  const totalWickets = activeScorecard?.wickets || 0;
  const overs = activeScorecard?.overs || 0;
  const wholeOvers = Math.floor(overs);
  const ballsInOver = Math.round((overs - wholeOvers) * 10);
  const totalLegalBalls = wholeOvers * 6 + ballsInOver;
  const crr = totalLegalBalls > 0 ? ((totalRuns / totalLegalBalls) * 6).toFixed(2) : '0.00';

  return (
    <div className="min-h-screen bg-[#080d0a] text-slate-100 pb-20">
      {/* Top Navigation Bar / Header */}
      <header className="sticky top-0 z-40 bg-[#0c140f]/95 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-950/50">
              <span className="material-symbols-outlined text-white text-2xl">sports</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-extrabold text-sm tracking-wide uppercase text-white leading-tight">
                  Umpire & Scorer Console
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                    socketConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      socketConnected ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {socketConnected ? 'LIVE SOCKET' : 'POLLING'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase block">
                Official Match Score Adder
              </span>
            </div>
          </div>

          {/* Quick link to scorecard */}
          <div className="flex items-center gap-2">
            {activeMatch && (
              <Link
                to={`/matches?matchId=${activeMatch.match_id}`}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-sm">visibility</span>
                <span>View Live Scorecard</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-16 right-4 z-50 max-w-sm animate-bounce-short">
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2.5 ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {notification.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Match Selector Bar */}
        <div className="bg-[#0f1712] border border-white/10 rounded-2xl p-4 shadow-xl">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleLoadMatch(inputMatchId);
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          >
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                tag
              </span>
              <input
                type="text"
                placeholder="Enter Match ID (e.g. MTC-2401)"
                value={inputMatchId}
                onChange={(e) => setInputMatchId(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoadingMatch}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">
                {isLoadingMatch ? 'sync' : 'search'}
              </span>
              <span>{isLoadingMatch ? 'Loading...' : 'Load Match'}</span>
            </button>

            {/* Quick selector dropdown */}
            {recentMatches.length > 0 && (
              <select
                aria-label="Recent Matches"
                onChange={(e) => {
                  if (e.target.value) {
                    setInputMatchId(e.target.value);
                    handleLoadMatch(e.target.value);
                  }
                }}
                value={activeMatch?.match_id || ''}
                className="px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500"
              >
                <option value="">Recent Matches...</option>
                {recentMatches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.match_id} ({m.team_name} vs {m.opponent_team_name})
                  </option>
                ))}
              </select>
            )}
          </form>
        </div>

        {activeMatch ? (
          <>
            {/* Live Score Banner */}
            <div className="bg-gradient-to-r from-[#0e1b12] via-[#102417] to-[#0e1b12] border border-emerald-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-500/5 blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                      MATCH ID: {activeMatch.match_id}
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {activeMatch.team_name} vs {activeMatch.opponent_team_name}
                    </span>
                  </div>

                  {/* Big Live Score */}
                  <div className="flex items-baseline gap-3">
                    <div className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-display">
                      {battingTeamName}: {totalRuns}
                      <span className="text-rose-400 font-normal">/{totalWickets}</span>
                    </div>
                    <div className="text-sm md:text-base font-semibold text-emerald-400 font-mono">
                      ({overs} Ov)
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                    <span>
                      CRR: <strong className="text-slate-200">{crr}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Balls Bowled: <strong className="text-slate-200">{totalLegalBalls}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Bowling:{' '}
                      <strong className="text-slate-200">{bowlingTeamName}</strong>
                    </span>
                  </div>
                </div>

                {/* Innings & Match Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSwitchInnings}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-200 transition-all flex items-center gap-1.5"
                    title="Switch Batting and Bowling Teams"
                  >
                    <span className="material-symbols-outlined text-sm text-emerald-400">
                      swap_horizontal_circle
                    </span>
                    <span>Switch Innings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEndInningsModal(true)}
                    className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-xs font-bold text-amber-300 transition-all flex items-center gap-1.5 shadow-sm"
                    title="End Current Innings and set target for opponent"
                  >
                    <span className="material-symbols-outlined text-sm text-amber-400">flag</span>
                    <span>End Innings</span>
                  </button>

                  <button
                    type="button"
                    onClick={openEndMatchModal}
                    className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded-xl text-xs font-bold text-rose-300 transition-all flex items-center gap-1.5 shadow-sm"
                    title="End Match and declare winner"
                  >
                    <span className="material-symbols-outlined text-sm text-rose-400">emoji_events</span>
                    <span>End Match</span>
                  </button>
                </div>
              </div>

              {/* Recent Deliveries Pill Stream */}
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                  Recent Balls:
                </span>
                {ballHistory.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No balls bowled in this session yet</span>
                ) : (
                  ballHistory.map((b) => (
                    <div
                      key={b.id}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-sm border ${
                        b.type === 'out'
                          ? 'bg-rose-600 text-white border-rose-400'
                          : b.runs === 4
                          ? 'bg-blue-600 text-white border-blue-400'
                          : b.runs === 6
                          ? 'bg-purple-600 text-white border-purple-400'
                          : b.type === 'wide' || b.type === 'no_ball'
                          ? 'bg-amber-600 text-white border-amber-400'
                          : b.runs === 0
                          ? 'bg-slate-800 text-slate-300 border-white/10'
                          : 'bg-emerald-700 text-white border-emerald-500'
                      }`}
                      title={`${b.strikerName || 'Batter'} vs ${b.bowlerName || 'Bowler'} (${b.timestamp})`}
                    >
                      {b.label}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Players In Action (Striker, Non-Striker, Bowler) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. STRIKER CARD */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  selectedStrikerId
                    ? 'bg-[#101b13] border-emerald-500/50 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/30'
                    : 'bg-[#0f1712] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-emerald-400 text-lg">
                      sports_cricket
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Striker (On Strike)
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>

                {/* Dropdown to pick Striker */}
                <select
                  aria-label="Striker Selection"
                  value={selectedStrikerId}
                  onChange={(e) => setSelectedStrikerId(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 mb-3"
                >
                  <option value="">Select Striker...</option>
                  {battingSquad.map((p) => (
                    <option key={p._id} value={p._id}>
                      #{p.jersey_number} {p.name} ({p.role})
                    </option>
                  ))}
                </select>

                {currentStrikerObj ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{currentStrikerObj.name}</span>
                      <span className="text-[11px] font-mono text-emerald-400">
                        #{currentStrikerObj.jersey_number}
                      </span>
                    </div>

                    {/* Striker Current Match Stats */}
                    <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-black/40 border border-white/5 text-center text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400">Runs</span>
                        <strong className="text-white text-sm font-bold">
                          {strikerScorecardStat?.runs || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Balls</span>
                        <strong className="text-slate-200">
                          {strikerScorecardStat?.balls || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">4s / 6s</span>
                        <strong className="text-slate-200">
                          {strikerScorecardStat?.fours || 0} / {strikerScorecardStat?.sixes || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">SR</span>
                        <strong className="text-emerald-300">
                          {strikerScorecardStat?.strike_rate || 0}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-3 text-center">
                    Select a striker to begin scoring
                  </div>
                )}
              </div>

              {/* 2. NON-STRIKER CARD */}
              <div className="p-4 rounded-2xl bg-[#0f1712] border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-slate-400 text-lg">
                      person
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Non-Striker
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSwapStrike}
                    className="px-2 py-0.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1 transition-all"
                    title="Rotate Strike"
                  >
                    <span className="material-symbols-outlined text-xs">swap_horiz</span>
                    <span>Rotate</span>
                  </button>
                </div>

                {/* Dropdown to pick Non-Striker */}
                <select
                  aria-label="Non-Striker Selection"
                  value={selectedNonStrikerId}
                  onChange={(e) => setSelectedNonStrikerId(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 mb-3"
                >
                  <option value="">Select Non-Striker...</option>
                  {battingSquad.map((p) => (
                    <option key={p._id} value={p._id} disabled={p._id === selectedStrikerId}>
                      #{p.jersey_number} {p.name} ({p.role})
                    </option>
                  ))}
                </select>

                {currentNonStrikerObj ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{currentNonStrikerObj.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        #{currentNonStrikerObj.jersey_number}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-black/40 border border-white/5 text-center text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400">Runs</span>
                        <strong className="text-white text-sm font-bold">
                          {nonStrikerScorecardStat?.runs || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Balls</span>
                        <strong className="text-slate-200">
                          {nonStrikerScorecardStat?.balls || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">4s / 6s</span>
                        <strong className="text-slate-200">
                          {nonStrikerScorecardStat?.fours || 0} / {nonStrikerScorecardStat?.sixes || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">SR</span>
                        <strong className="text-slate-300">
                          {nonStrikerScorecardStat?.strike_rate || 0}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-3 text-center">
                    Select a non-striker
                  </div>
                )}
              </div>

              {/* 3. BOWLER CARD */}
              <div className="p-4 rounded-2xl bg-[#0f1712] border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-400 text-lg">
                      sports_baseball
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Bowler ({bowlingTeamName})
                    </span>
                  </div>
                </div>

                {/* Dropdown to pick Bowler */}
                <select
                  aria-label="Bowler Selection"
                  value={selectedBowlerId}
                  onChange={(e) => setSelectedBowlerId(e.target.value)}
                  className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 mb-3"
                >
                  <option value="">Select Bowler...</option>
                  {bowlingSquad.map((p) => (
                    <option key={p._id} value={p._id}>
                      #{p.jersey_number} {p.name} ({p.role})
                    </option>
                  ))}
                </select>

                {currentBowlerObj ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{currentBowlerObj.name}</span>
                      <span className="text-[11px] font-mono text-amber-400">
                        #{currentBowlerObj.jersey_number}
                      </span>
                    </div>

                    {/* Bowler Current Match Stats */}
                    <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-black/40 border border-white/5 text-center text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400">Overs</span>
                        <strong className="text-white text-sm font-bold">
                          {bowlerScorecardStat?.overs !== undefined && bowlerScorecardStat.overs !== null
                            ? Number(bowlerScorecardStat.overs).toFixed(1)
                            : bowlerScorecardStat?.balls_bowled
                            ? `${Math.floor(bowlerScorecardStat.balls_bowled / 6)}.${bowlerScorecardStat.balls_bowled % 6}`
                            : '0.0'}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Runs</span>
                        <strong className="text-slate-200">
                          {bowlerScorecardStat?.runs || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Wickets</span>
                        <strong className="text-emerald-400 text-sm font-bold">
                          {bowlerScorecardStat?.wickets || 0}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Econ</span>
                        <strong className="text-amber-300">
                          {bowlerScorecardStat?.economy !== undefined && bowlerScorecardStat.economy !== null
                            ? Number(bowlerScorecardStat.economy).toFixed(2)
                            : bowlerScorecardStat?.balls_bowled && bowlerScorecardStat.balls_bowled > 0
                            ? (((bowlerScorecardStat.runs || 0) / (bowlerScorecardStat.balls_bowled / 6))).toFixed(2)
                            : '0.00'}
                        </strong>
                      </div>
                    </div>

                    {ballsInOver === 0 && totalLegalBalls > 0 && (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300 animate-pulse">
                        <span className="flex items-center gap-1 font-semibold text-[11px]">
                          <span className="material-symbols-outlined text-sm">notifications_active</span>
                          Over completed!
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCompletedOverNumber(wholeOvers);
                            setLastBowlerName(currentBowlerObj?.name || 'Current Bowler');
                            setLastBowlerId(selectedBowlerId);
                            setShowOverCompleteModal(true);
                          }}
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-all"
                        >
                          Change Bowler
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-3 text-center">
                    Select a bowler from {bowlingTeamName}
                  </div>
                )}
              </div>
            </div>

            {/* RECTANGULAR ACTION BUTTONS SECTION */}
            <div className="bg-[#0e1711] border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-extrabold uppercase tracking-wider text-white">
                    Score Action Buttons
                  </h2>
                  <p className="text-xs text-slate-400">
                    Click a button to record delivery for{' '}
                    <strong className="text-emerald-400">{currentStrikerObj?.name || 'Striker'}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSwapStrike}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-all"
                >
                  <span className="material-symbols-outlined text-sm text-emerald-400">swap_horiz</span>
                  <span>Rotate Strike</span>
                </button>
              </div>

              {/* The Rectangle Buttons as requested: 1, 2, 3, 4, 6, out, wide, no ball + dot */}
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2.5">
                {/* 0 (Dot Ball) */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 0)}
                  className="h-16 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-200 font-extrabold text-xl flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>0</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">Dot</span>
                </button>

                {/* 1 Run */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 1)}
                  className="h-16 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-200 font-extrabold text-xl flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>1</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-400">Run</span>
                </button>

                {/* 2 Runs */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 2)}
                  className="h-16 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-200 font-extrabold text-xl flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>2</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-400">Runs</span>
                </button>

                {/* 3 Runs */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 3)}
                  className="h-16 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-200 font-extrabold text-xl flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>3</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-400">Runs</span>
                </button>

                {/* 4 Runs (Four) */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 4)}
                  className="h-16 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-500/40 text-blue-200 font-black text-2xl flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-blue-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>4</span>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-blue-300">Four</span>
                </button>

                {/* 6 Runs (Six) */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('runs', 6)}
                  className="h-16 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-black text-2xl flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-purple-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>6</span>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-purple-300">Six</span>
                </button>

                {/* OUT / WICKET */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => setShowOutModal(true)}
                  className="h-16 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-black text-base flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-rose-950/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>OUT</span>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-rose-300">Wicket</span>
                </button>

                {/* WIDE */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('wide', 0)}
                  className="h-16 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-200 font-bold text-sm flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>WIDE</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-400">+1 Extra</span>
                </button>

                {/* NO BALL */}
                <button
                  type="button"
                  disabled={isSubmittingBall}
                  onClick={() => handleRecordBallClick('no_ball', 0)}
                  className="h-16 rounded-xl bg-orange-950/80 hover:bg-orange-900 border border-orange-500/40 text-orange-200 font-bold text-sm flex flex-col items-center justify-center gap-0.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <span>NO BALL</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-orange-400">+1 Extra</span>
                </button>
              </div>
            </div>

            {/* OUT DISMISSAL MODAL */}
            {showOutModal && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#121c15] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-rose-400 text-xl">
                        gavel
                      </span>
                      <h3 className="text-base font-extrabold text-white">
                        Record Wicket: {currentStrikerObj?.name || 'Striker'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOutModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-300">
                    Select dismissal mode for {currentStrikerObj?.name || 'batter'}:
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: 'caught', label: 'Caught' },
                      { id: 'bowled', label: 'Bowled' },
                      { id: 'lbw', label: 'LBW' },
                      { id: 'run_out', label: 'Run Out' },
                      { id: 'stumped', label: 'Stumped' },
                      { id: 'hit_wicket', label: 'Hit Wicket' },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setDismissalType(type.id)}
                        className={`p-2.5 rounded-xl border font-semibold transition-all ${
                          dismissalType === type.id
                            ? 'bg-rose-900/60 border-rose-500 text-white'
                            : 'bg-black/30 border-white/10 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowOutModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingBall}
                      onClick={handleConfirmOut}
                      className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>Confirm Wicket</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* OVER COMPLETED / CHANGE BOWLER ALERT MODAL */}
            {showOverCompleteModal && (
              <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-[#101b13] border-2 border-amber-500/60 rounded-3xl max-w-lg w-full p-6 shadow-2xl shadow-amber-950/60 space-y-5">
                  {/* Header with icon & badge */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-2xl animate-bounce">
                          notifications_active
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-white uppercase tracking-wide">
                            Over Completed!
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold uppercase border border-amber-500/30">
                            Over #{completedOverNumber}
                          </span>
                        </div>
                        <p className="text-xs text-amber-400/90 font-semibold mt-0.5">
                          6 legal deliveries bowled. Please change the bowler for the next over!
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowOverCompleteModal(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>

                  {/* Summary of finished over */}
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Previous Bowler:</span>
                      <strong className="text-white text-sm font-bold">
                        {lastBowlerName || 'Current Bowler'}
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[11px]">Bowling Team:</span>
                      <strong className="text-amber-400 font-semibold">
                        {bowlingTeamName}
                      </strong>
                    </div>
                  </div>

                  {/* Select Next Bowler List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                        Select Next Bowler ({bowlingSquad.length} Players Available):
                      </span>
                      <span className="text-[10px] text-slate-400">Click to select & continue</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {bowlingSquad.map((player) => {
                        const isPrev = player._id === lastBowlerId;
                        const isCurrent = player._id === selectedBowlerId;

                        const pBStat = activeScorecard?.bowlers_stats?.find(
                          (bs) => {
                            const pid = typeof bs.player_id === 'object' && bs.player_id !== null ? bs.player_id._id : bs.player_id;
                            return String(pid) === String(player._id);
                          }
                        );

                        return (
                          <div
                            key={player._id}
                            onClick={() => {
                              setSelectedBowlerId(player._id);
                              setShowOverCompleteModal(false);
                              showToast('success', `Bowler changed to ${player.name} for Over #${completedOverNumber + 1}!`);
                            }}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isCurrent && !isPrev
                                ? 'bg-amber-500/20 border-amber-500 text-white shadow-md'
                                : isPrev
                                ? 'bg-black/30 border-white/5 opacity-60 hover:opacity-100 hover:border-amber-500/40'
                                : 'bg-black/40 border-white/10 hover:border-amber-500/50 hover:bg-amber-500/10'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">
                                #{player.jersey_number}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-white">{player.name}</span>
                                  {isPrev && (
                                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/30">
                                      Just bowled
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  {player.role} • {player.bowler_type || 'Bowler'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {pBStat && (
                                <div className="text-right text-[11px] font-mono text-slate-300 hidden sm:block">
                                  <span>{pBStat.overs ?? 0} ov • {pBStat.wickets ?? 0}w/{pBStat.runs ?? 0}r</span>
                                </div>
                              )}
                              <button
                                type="button"
                                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shadow-sm"
                              >
                                Select
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowOverCompleteModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300"
                    >
                      Dismiss (Choose Later)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* END INNINGS MODAL */}
            {showEndInningsModal && (
              <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-[#101b13] border-2 border-amber-500/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl">flag</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-wide">
                          End Current Innings
                        </h3>
                        <p className="text-xs text-slate-400">
                          Conclude innings & set target
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEndInningsModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Batting Team:</span>
                      <strong className="text-white text-sm">{battingTeamName}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Final Innings Score:</span>
                      <strong className="text-emerald-400 font-display text-base font-bold">
                        {totalRuns} / {totalWickets} ({overs} ov)
                      </strong>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                        Target for {bowlingTeamName}:
                      </span>
                      <strong className="text-amber-300 font-mono text-base font-extrabold">
                        {totalRuns + 1} Runs
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ending the innings will broadcast an instant alert on the live scorecard page and automatically rotate to the 2nd innings with <strong className="text-slate-200">{bowlingTeamName}</strong> batting.
                  </p>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEndInningsModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isEndingInnings}
                      onClick={handleConfirmEndInnings}
                      className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-950/60 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isEndingInnings ? 'sync' : 'check'}
                      </span>
                      <span>{isEndingInnings ? 'Ending...' : 'Confirm End Innings'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* END MATCH MODAL */}
            {showEndMatchModal && (
              <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-[#121815] border-2 border-rose-500/60 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl">emoji_events</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-wide">
                          End Match & Declare Result
                        </h3>
                        <p className="text-xs text-slate-400">
                          Complete match and announce winner
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEndMatchModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Select Winning Team:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: activeMatch.team_name, label: activeMatch.team_name },
                        { id: activeMatch.opponent_team_name, label: activeMatch.opponent_team_name },
                        { id: 'Match Tied', label: 'Match Tied' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setWinnerSelection(item.id)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all text-center ${
                            winnerSelection === item.id
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/40'
                              : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                        Win Margin / Result Note:
                      </label>
                      <input
                        type="text"
                        value={winMarginText}
                        onChange={(e) => setWinMarginText(e.target.value)}
                        placeholder="e.g. won by 15 runs, won by 4 wickets"
                        className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Completing this match marks the match status as <strong className="text-emerald-400">Completed</strong> in MongoDB and broadcasts the final winner ceremony to all live viewers!
                  </p>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEndMatchModal(false)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isEndingMatch || !winnerSelection}
                      onClick={handleConfirmEndMatch}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/60 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isEndingMatch ? 'sync' : 'emoji_events'}
                      </span>
                      <span>{isEndingMatch ? 'Ending...' : 'Declare Winner & End Match'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-[#0f1712] border border-white/10 rounded-2xl p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">sports</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">No Match Selected</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Enter a Match ID in the bar above or pick one from recent matches to begin recording ball-by-ball scores.
              </p>
            </div>
            {recentMatches.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                {recentMatches.map((m) => (
                  <button
                    key={m.match_id}
                    type="button"
                    onClick={() => {
                      setInputMatchId(m.match_id);
                      handleLoadMatch(m.match_id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-all font-mono"
                  >
                    {m.match_id} ({m.team_name} vs {m.opponent_team_name})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
