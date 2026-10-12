import { useState, useEffect, type FC, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, Team } from '../types';
import { fetchPlayers, createTeam, fetchTeams, deleteTeam } from '../services/api';

interface TeamCreatePageProps {
  onNavigateToPlayers?: () => void;
}

export const TeamCreatePage: FC<TeamCreatePageProps> = ({ onNavigateToPlayers }) => {
  const navigate = useNavigate();
  // Team Form State (Stores player _id array for database simplicity)
  const [teamName, setTeamName] = useState<string>('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  
  // Data State
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [existingTeams, setExistingTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('All');

  // Expanded stats per player card
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Record<string, boolean>>({});

  // Tab to view existing teams vs team builder
  const [viewMode, setViewMode] = useState<'create' | 'teams'>('create');

  // Notification message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [playersData, teamsData] = await Promise.all([
        fetchPlayers(),
        fetchTeams().catch((err) => {
          console.warn('fetchTeams error:', err);
          return [];
        }),
      ]);
      setAllPlayers(playersData);
      setExistingTeams(teamsData);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect to backend server';
      console.warn('Error loading data:', errorMsg);
      setFetchError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage(null);
    }, 4500);
  };

  const toggleExpandPlayer = (id: string) => {
    setExpandedPlayerIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Toggle player selection by _id for the team
  const handleTogglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      } else {
        return [...prev, playerId];
      }
    });
  };

  // Submit and create team with player _ids
  const handleCreateTeam = async (e: FormEvent) => {
    e.preventDefault();

    const trimmedName = teamName.trim();
    if (!trimmedName) {
      showNotification('error', 'Please enter a team name before submitting.');
      return;
    }

    if (selectedPlayerIds.length === 0) {
      showNotification('error', 'Please add at least one player to your team.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newTeam = await createTeam({
        team_name: trimmedName,
        team_players: selectedPlayerIds,
      });

      showNotification('success', `Team "${newTeam.team_name}" created with ${selectedPlayerIds.length} players!`);
      // Reset form
      setTeamName('');
      setSelectedPlayerIds([]);

      // Optimistically add created team so it displays immediately
      setExistingTeams((prev) => [newTeam, ...prev.filter((t) => t._id !== newTeam._id)]);

      // Background re-fetch to ensure sync with MongoDB
      fetchTeams()
        .then((data) => {
          if (data && data.length > 0) setExistingTeams(data);
        })
        .catch((err) => console.warn('Background teams refresh:', err));

      // Switch to teams tab to view saved team
      setViewMode('teams');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create team';
      showNotification('error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, name: string) => {
    if (!window.confirm(`Delete team "${name}"?`)) return;

    try {
      await deleteTeam(teamId);
      setExistingTeams((prev) => prev.filter((t) => t._id !== teamId));
      showNotification('success', `Team "${name}" deleted.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete team';
      showNotification('error', errorMsg);
    }
  };

  // Filtered players
  const filteredPlayers = allPlayers.filter((player) => {
    const matchesSearch =
      player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.jersey_number?.toString().includes(searchQuery);
    const matchesRole = roleFilter === 'All' || player.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen bg-[#080d0a] text-slate-100 pb-20">
      {/* Top App Header */}
      <header className="sticky top-0 z-40 bg-[#0c140f]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <span className="material-symbols-outlined text-white text-xl">groups</span>
            </div>
            <div>
              <h1 className="font-display font-extrabold text-sm tracking-wide uppercase text-white leading-tight">
                Team Builder
              </h1>
              <span className="text-[10px] text-emerald-400 font-medium tracking-wider uppercase block">
                Squad Management
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onNavigateToPlayers) onNavigateToPlayers();
                else navigate('/');
              }}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span className="hidden sm:inline">Add Players</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'create' ? 'teams' : 'create')}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'teams'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/40'
                  : 'bg-white/5 text-slate-300 hover:text-white border-white/10'
              }`}
            >
              <span className="material-symbols-outlined text-sm">shield</span>
              <span>Teams ({existingTeams.length})</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/matches')}
              className="px-3 py-1.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white border border-emerald-500/30 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">handshake</span>
              <span>Matchmaking</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {message && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 transition-all border ${
            message.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/50'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {message.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span>{message.text}</span>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* Connection Error Banner */}
        {!isLoading && fetchError && (
          <div className="py-6 px-4 text-center rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400 mb-2">
              <span className="material-symbols-outlined text-xl">cloud_off</span>
            </div>
            <h4 className="font-semibold text-white text-sm">Cannot reach backend server</h4>
            <p className="text-xs text-amber-200/80 mt-1 max-w-sm mx-auto">
              Please ensure your backend is running at <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">http://localhost:3000</code>.
            </p>
            <button
              type="button"
              onClick={() => loadData()}
              className="mt-3 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* VIEW 1: CREATION FORM + SQUARE PLAYER CARDS */}
        {viewMode === 'create' && (
          <>
            {/* STEP 1: TEAM NAME INPUT & SQUAD SUMMARY AT TOP */}
            <section className="p-4 sm:p-5 rounded-2xl bg-[#0e1611] border border-white/10 shadow-lg shadow-black/40">
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                      Step 1 • Team Identity
                    </span>
                    <h2 className="font-display font-extrabold text-base sm:text-lg text-white">
                      Create New Cricket Team
                    </h2>
                  </div>

                  {/* Selected count pill */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="text-xs text-slate-400">Squad:</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                        selectedPlayerIds.length >= 11
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : selectedPlayerIds.length > 0
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-white/5 text-slate-400 border-white/10'
                      }`}
                    >
                      {selectedPlayerIds.length} Players Selected
                    </span>
                  </div>
                </div>

                {/* Team Name Input Row */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                      shield
                    </span>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Enter Team Name (e.g. Royal Strikers, Titans CC, Phoenix XI)..."
                      className="w-full bg-[#080d0a] border border-white/15 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !teamName.trim() || selectedPlayerIds.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold tracking-wide uppercase shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                        <span>Saving Team...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">cloud_upload</span>
                        <span>Save Team to DB</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Selected Players Tags / Chips */}
                {selectedPlayerIds.length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-slate-400">Added to this squad:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerIds([])}
                        className="text-[11px] text-rose-400 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPlayerIds.map((playerId, idx) => {
                        const player = allPlayers.find((p) => p._id === playerId);
                        const playerName = player ? player.name : playerId;
                        const jerseyNum = player?.jersey_number;

                        return (
                          <span
                            key={playerId}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
                          >
                            <span className="text-[10px] text-emerald-400/80 font-mono">#{idx + 1}</span>
                            <span>{playerName}</span>
                            {jerseyNum !== undefined && (
                              <span className="text-[10px] text-slate-400">({jerseyNum})</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleTogglePlayer(playerId)}
                              className="hover:text-rose-400 transition-colors ml-0.5"
                              title="Remove from squad"
                            >
                              <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form>
            </section>

            {/* STEP 2: PLAYER SELECTION WITH SQUARE CARDS */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                    Step 2 • Select Squad
                  </span>
                  <h3 className="font-display font-extrabold text-base text-white">
                    Available Players ({allPlayers.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review each player&apos;s stats dropdown and click &quot;+ Add to Team&quot; to build your squad.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or jersey..."
                    className="w-full bg-[#0e1611] border border-white/10 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Role Filters */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {['All', 'Batter', 'Bowler', 'All-Rounder', 'Wicket-Keeper Batsman'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      roleFilter === r
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-[#0e1611] text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {r === 'Wicket-Keeper Batsman' ? 'Keeper' : r}
                  </button>
                ))}
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="py-16 text-center text-slate-400">
                  <span className="material-symbols-outlined animate-spin text-3xl text-emerald-500">
                    progress_activity
                  </span>
                  <p className="text-xs mt-2">Loading players from database...</p>
                </div>
              )}

              {/* Empty Players State */}
              {!isLoading && filteredPlayers.length === 0 && (
                <div className="py-12 px-4 text-center rounded-2xl bg-[#0e1611] border border-white/10">
                  <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400 mb-3">
                    <span className="material-symbols-outlined text-2xl">person_off</span>
                  </div>
                  <h4 className="font-semibold text-white text-sm">No players found</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    {searchQuery || roleFilter !== 'All'
                      ? 'No players match your active search or filter.'
                      : 'No players registered yet. Please add players first.'}
                  </p>
                  {onNavigateToPlayers && (
                    <button
                      type="button"
                      onClick={onNavigateToPlayers}
                      className="mt-4 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">person_add</span>
                      <span>Go to Register Players</span>
                    </button>
                  )}
                </div>
              )}

              {/* SQUARE PLAYER CARDS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredPlayers.map((player) => {
                  const isAdded = selectedPlayerIds.includes(player._id);
                  const isExpanded = !!expandedPlayerIds[player._id];

                  return (
                    <div
                      key={player._id}
                      className={`p-3.5 rounded-2xl bg-[#0e1611] border transition-all flex flex-col justify-between shadow-md relative overflow-hidden ${
                        isAdded
                          ? 'border-emerald-500/70 shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      {/* Top Selection Ribbon Badge */}
                      {isAdded && (
                        <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-bl-xl tracking-wider flex items-center gap-1 shadow-sm">
                          <span className="material-symbols-outlined text-xs">check</span>
                          In Team
                        </div>
                      )}

                      {/* Card Header (Avatar + Info + Jersey) */}
                      <div>
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
                            {player.profile_img ? (
                              <img
                                src={player.profile_img}
                                alt={player.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="material-symbols-outlined text-2xl text-slate-400">person</span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 pr-14">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 inline-block mb-1">
                              {player.role}
                            </span>
                            <h4 className="font-display font-bold text-sm text-white truncate leading-tight">
                              {player.name}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {player.handed} • {player.bowler_type || 'None'}
                            </p>
                          </div>

                          {/* Jersey Number */}
                          <div className="absolute top-3 right-3 text-center">
                            {!isAdded && (
                              <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-center">
                                <span className="text-[8px] uppercase tracking-wider text-slate-400 block -mb-0.5">
                                  No
                                </span>
                                <span className="font-display font-extrabold text-xs text-white">
                                  #{player.jersey_number}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Core Career Stats Pills & Dropdown Chevron */}
                        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5">
                          <div className="grid grid-cols-4 gap-1 text-center flex-1">
                            <div className="p-1 rounded bg-black/40">
                              <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Mat</span>
                              <span className="font-display font-bold text-xs text-slate-200">
                                {player.total_matches ?? 0}
                              </span>
                            </div>
                            <div className="p-1 rounded bg-black/40">
                              <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Runs</span>
                              <span className="font-display font-bold text-xs text-emerald-400">
                                {player.total_runs ?? 0}
                              </span>
                            </div>
                            <div className="p-1 rounded bg-black/40">
                              <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Wkts</span>
                              <span className="font-display font-bold text-xs text-sky-300">
                                {player.total_wickets ?? 0}
                              </span>
                            </div>
                            <div className="p-1 rounded bg-black/40">
                              <span className="text-[8px] uppercase tracking-wider text-slate-400 block">High</span>
                              <span className="font-display font-bold text-xs text-slate-200">
                                {player.highest_runs ?? 0}
                              </span>
                            </div>
                          </div>

                          {/* Stats Dropdown Button */}
                          <button
                            type="button"
                            onClick={() => toggleExpandPlayer(player._id)}
                            className={`p-1.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                              isExpanded
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-black/30 text-slate-400 hover:text-white hover:bg-white/5 border-white/10'
                            }`}
                            title={isExpanded ? 'Hide complete stats' : 'Show complete stats'}
                          >
                            <span className="material-symbols-outlined text-base">
                              {isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                            </span>
                          </button>
                        </div>

                        {/* EXPANDABLE DROPDOWN STATS DRAWER */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-2 animate-in fade-in duration-200">
                            {/* Batting Breakdown */}
                            <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[10px]">sports_cricket</span>
                                  Batting
                                </span>
                              </div>
                              <div className="grid grid-cols-4 gap-1 text-center">
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">4s</span>
                                  <span className="font-display font-bold text-[11px] text-white">
                                    {player.total_four ?? 0}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">6s</span>
                                  <span className="font-display font-bold text-[11px] text-amber-400">
                                    {player.total_six ?? 0}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">50s</span>
                                  <span className="font-display font-bold text-[11px] text-emerald-300">
                                    {player.total_fifty ?? 0}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">100s</span>
                                  <span className="font-display font-bold text-[11px] text-amber-300">
                                    {player.total_centaury ?? 0}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Bowling Breakdown */}
                            <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[10px]">sports_baseball</span>
                                  Bowling
                                </span>
                                <span className="text-[8px] text-slate-400 truncate max-w-[120px]">
                                  {player.bowler_type || 'None'}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-center">
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">
                                    Overs
                                  </span>
                                  <span className="font-display font-bold text-[11px] text-white">
                                    {Math.floor((player.balls_bowled || 0) / 6)}.{(player.balls_bowled || 0) % 6}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">
                                    Runs
                                  </span>
                                  <span className="font-display font-bold text-[11px] text-rose-300">
                                    {player.runs_conceded ?? 0}
                                  </span>
                                </div>
                                <div className="p-1 rounded bg-white/5">
                                  <span className="text-[7px] uppercase tracking-wider text-slate-400 block">
                                    Econ
                                  </span>
                                  <span className="font-display font-bold text-[11px] text-slate-200">
                                    {(player.balls_bowled || 0) > 0
                                      ? ((player.runs_conceded || 0) / ((player.balls_bowled || 0) / 6)).toFixed(2)
                                      : '0.00'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Fielding */}
                            <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-xs px-2.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">sports_handball</span>
                                Fielding
                              </span>
                              <div className="flex items-center gap-3 text-[11px]">
                                <span>
                                  Catches: <strong className="text-white">{player.total_catches ?? 0}</strong>
                                </span>
                                <span>
                                  Stumpings: <strong className="text-white">{player.total_stumpings ?? 0}</strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ADD TO TEAM BUTTON AT BOTTOM OF SQUARE CARD */}
                      <div className="mt-3 pt-2.5 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleTogglePlayer(player._id)}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                            isAdded
                              ? 'bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">
                            {isAdded ? 'remove_circle_outline' : 'person_add'}
                          </span>
                          <span>{isAdded ? 'Remove from Team' : '+ Add to Team'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* VIEW 2: SAVED TEAMS IN MONGO DB */}
        {viewMode === 'teams' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                  Database Records
                </span>
                <h2 className="font-display font-extrabold text-base sm:text-lg text-white">
                  Created Teams ({existingTeams.length})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setViewMode('create')}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Create Another Team</span>
              </button>
            </div>

            {existingTeams.length === 0 ? (
              <div className="py-16 text-center rounded-2xl bg-[#0e1611] border border-white/10">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400 mb-3">
                  <span className="material-symbols-outlined text-2xl">shield</span>
                </div>
                <h4 className="font-semibold text-white text-sm">No teams created yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Use the team builder to specify a team name and select your squad members.
                </p>
                <button
                  type="button"
                  onClick={() => setViewMode('create')}
                  className="mt-4 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">group_add</span>
                  <span>Build First Team</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {existingTeams.map((team) => (
                  <div
                    key={team._id}
                    className="p-4 rounded-2xl bg-[#0e1611] border border-white/10 shadow-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <span className="material-symbols-outlined text-xl">shield</span>
                        </div>
                        <div>
                          <h3 className="font-display font-extrabold text-base text-white">
                            {team.team_name}
                          </h3>
                          <span className="text-[11px] text-slate-400">
                            {team.team_players?.length || 0} registered players
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteTeam(team._id, team.team_name)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Delete team"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>

                    {/* Squad Members Pills */}
                    <div className="pt-2 border-t border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Squad Roster
                      </span>
                      {team.team_players && team.team_players.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {team.team_players.map((member, i) => {
                            let displayName = '';
                            let jerseyNum: number | undefined;

                            if (typeof member === 'object' && member !== null && 'name' in member) {
                              displayName = (member as Player).name;
                              jerseyNum = (member as Player).jersey_number;
                            } else {
                              const found = allPlayers.find((p) => p._id === member);
                              displayName = found ? found.name : String(member);
                              jerseyNum = found?.jersey_number;
                            }

                            return (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
                              >
                                <span className="text-[9px] text-emerald-400 font-mono">#{i + 1}</span>
                                <span>{displayName}</span>
                                {jerseyNum !== undefined && (
                                  <span className="text-[9px] text-slate-400">({jerseyNum})</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No players listed in squad.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
