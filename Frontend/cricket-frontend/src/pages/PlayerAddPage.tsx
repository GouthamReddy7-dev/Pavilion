import { useState, useEffect, type FC, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, PlayerFormData } from '../types';
import { fetchPlayers, createPlayer } from '../services/api';

const ROLES = [
  { id: 'Batter', label: 'Batter', icon: 'sports_cricket' },
  { id: 'Bowler', label: 'Bowler', icon: 'sports_baseball' },
  { id: 'All-Rounder', label: 'All-Rounder', icon: 'star' },
  { id: 'Wicket-Keeper Batsman', label: 'Wicket Keeper', icon: 'sports_handball' },
] as const;

const BOWLING_STYLES = [
  'None',
  'Right-Arm Fast',
  'Right-Arm Medium',
  'Left-Arm Fast',
  'Right-Arm Off Spin',
  'Right-Arm Leg Spin',
  'Left-Arm Orthodox',
];

interface PlayerFormState {
  name: string;
  jersey_number: number | '';
  role: 'Batter' | 'Bowler' | 'All-Rounder' | 'Wicket-Keeper Batsman';
  handed: 'Right Handed' | 'Left Handed';
  bowler_type: string;
  profile_img: string;
  [key: string]: unknown;
}

interface PlayerAddPageProps {
  onNavigateToTeams?: () => void;
}

export const PlayerAddPage: FC<PlayerAddPageProps> = ({ onNavigateToTeams }) => {
  const navigate = useNavigate();
  // Navigation view mode for mobile: 'register' or 'roster'
  const [activeTab, setActiveTab] = useState<'register' | 'roster'>('register');

  // Form State
  const [formData, setFormData] = useState<PlayerFormState>({
    name: '',
    jersey_number: 18,
    role: 'Batter',
    handed: 'Right Handed',
    bowler_type: 'None',
    profile_img: '',
  });

  // Players Directory State
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Record<string, boolean>>({});

  const toggleExpandPlayer = (id: string) => {
    setExpandedPlayerIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchPlayers();
      setPlayers(data);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('Could not load players from backend:', errorMsg);
      setFetchError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage(null);
    }, 4000);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === 'jersey_number') {
        return {
          ...prev,
          jersey_number: value === '' ? '' : Number(value),
        };
      }
      return {
        ...prev,
        [name]: value,
      };
    });
  };

  const handleRoleSelect = (role: typeof ROLES[number]['id']) => {
    setFormData((prev) => ({
      ...prev,
      role,
      bowler_type: role === 'Batter' ? 'None' : prev.bowler_type === 'None' ? 'Right-Arm Medium' : prev.bowler_type,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showNotification('error', 'Please enter player name');
      return;
    }

    if (
      formData.jersey_number === '' ||
      formData.jersey_number === undefined ||
      formData.jersey_number === null ||
      isNaN(Number(formData.jersey_number)) ||
      Number(formData.jersey_number) < 0
    ) {
      showNotification('error', 'Please provide a valid jersey number');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: PlayerFormData = {
        name: formData.name.trim(),
        jersey_number: Number(formData.jersey_number),
        role: formData.role,
        handed: formData.handed,
        bowler_type: formData.bowler_type,
        profile_img: formData.profile_img,
      };

      const newPlayer = await createPlayer(payload);

      showNotification('success', `${newPlayer.name} (#${newPlayer.jersey_number}) registered with initial 0 stats!`);
      // Reset form
      setFormData({
        name: '',
        jersey_number: Math.floor(Math.random() * 90) + 10,
        role: 'Batter',
        handed: 'Right Handed',
        bowler_type: 'None',
        profile_img: '',
      });

      // Refresh roster
      await loadPlayers();
      // On mobile, switch to roster tab so user sees their registered card
      setActiveTab('roster');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to register player';
      showNotification('error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered players list
  const filteredPlayers = players.filter((player) => {
    const matchesSearch =
      player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.jersey_number?.toString().includes(searchQuery);
    const matchesRole = roleFilter === 'All' || player.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen bg-[#080d0a] text-slate-100 pb-16">
      {/* Top Mobile App Bar */}
      <div className="sticky top-0 z-40 bg-[#0c140f]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#15803d] flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-lg">sports_cricket</span>
            </div>
            <div>
              <h1 className="font-display font-bold text-base leading-tight tracking-wide text-white">PAVILION</h1>
              <p className="text-[10px] text-emerald-400/80 font-medium tracking-wider uppercase">Player Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
              <span>{players.length} Players</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onNavigateToTeams) onNavigateToTeams();
                else navigate('/teams');
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 border border-emerald-500/30"
            >
              <span className="material-symbols-outlined text-sm">groups</span>
              <span>Create Team</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/matches')}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white text-[11px] font-semibold transition-colors flex items-center gap-1 border border-white/10"
            >
              <span className="material-symbols-outlined text-sm">handshake</span>
              <span>Matchmaking</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="max-w-md mx-auto px-4 pt-3 pb-1">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
              activeTab === 'register'
                ? 'bg-[#15803d] text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            <span>Add Player</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
              activeTab === 'roster'
                ? 'bg-[#15803d] text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-base">badge</span>
            <span>Registered ({players.length})</span>
          </button>
        </div>
      </div>

      {/* Floating Notification */}
      {message && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto">
          <div
            className={`px-4 py-3 rounded-xl border flex items-center gap-3 shadow-xl backdrop-blur-md transition-all ${
              message.type === 'success'
                ? 'bg-[#14532d]/90 border-emerald-500/50 text-white'
                : 'bg-[#450a0a]/90 border-rose-500/50 text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <p className="text-xs font-medium flex-1">{message.text}</p>
          </div>
        </div>
      )}

      {/* Content Area */}
      <main className="max-w-md mx-auto px-4 pt-3">
        {/* ================= REGISTER VIEW ================= */}
        {activeTab === 'register' && (
          <div className="space-y-4">
            {/* Live Profile Card Preview */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#121c16] to-[#0c130f] border border-white/10 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-[#15803d]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-white overflow-hidden relative">
                    {formData.profile_img ? (
                      <img
                        src={formData.profile_img}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="material-symbols-outlined text-3xl text-slate-400">person</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#15803d]/30 text-emerald-300 border border-emerald-500/30">
                        {formData.role}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-lg text-white mt-0.5">
                      {formData.name.trim() || 'Player Name'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {formData.handed} • {formData.bowler_type}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Jersey</span>
                    <span className="font-display font-extrabold text-lg text-white">
                      #{formData.jersey_number || '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Initial Stats Baseline Badge */}
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                  <span className="flex items-center gap-1 text-slate-300 font-medium">
                    <span className="material-symbols-outlined text-xs text-emerald-400">sync</span>
                    Initial Career Baseline
                  </span>
                  <span className="text-[10px] text-emerald-400/90 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                    Auto-Updates Post Match
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Matches</p>
                    <p className="font-display font-bold text-sm text-white mt-0.5">0</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Runs</p>
                    <p className="font-display font-bold text-sm text-white mt-0.5">0</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Wickets</p>
                    <p className="font-display font-bold text-sm text-white mt-0.5">0</p>
                  </div>
                  <div className="p-1.5 rounded-lg bg-black/40 border border-white/5">
                    <p className="text-[9px] text-slate-400 uppercase font-medium">Catches</p>
                    <p className="font-display font-bold text-sm text-white mt-0.5">0</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-[#0e1611] border border-white/10 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Shiva Reddy"
                    required
                    className="w-full px-3.5 py-3 rounded-xl bg-black/50 border border-white/15 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]"
                  />
                  <span className="material-symbols-outlined absolute right-3 top-3 text-slate-500 text-lg">
                    person
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Jersey Number *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="jersey_number"
                    value={formData.jersey_number}
                    onChange={handleInputChange}
                    min="0"
                    max="999"
                    placeholder="18"
                    required
                    className="w-full px-3.5 py-3 rounded-xl bg-black/50 border border-white/15 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#22c55e] focus:ring-1 focus:ring-[#22c55e]"
                  />
                  <span className="material-symbols-outlined absolute right-3 top-3 text-slate-500 text-lg">
                    tag
                  </span>
                </div>
              </div>

              {/* Primary Role Selector (Touch Friendly Pills) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Playing Role *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleRoleSelect(role.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                        formData.role === role.id
                          ? 'bg-[#15803d]/30 border-emerald-500 text-white shadow-sm'
                          : 'bg-black/30 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-base ${
                          formData.role === role.id ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {role.icon}
                      </span>
                      <span className="truncate">{role.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Batting Hand Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Batting Hand
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Right Handed', 'Left Handed'] as const).map((hand) => (
                    <button
                      key={hand}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, handed: hand }))}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                        formData.handed === hand
                          ? 'bg-[#15803d]/30 border-emerald-500 text-white'
                          : 'bg-black/30 border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {hand}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bowling Style Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Bowling Style
                </label>
                <select
                  name="bowler_type"
                  value={formData.bowler_type}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-3 rounded-xl bg-black/50 border border-white/15 text-white text-sm focus:outline-none focus:border-[#22c55e]"
                >
                  {BOWLING_STYLES.map((style) => (
                    <option key={style} value={style} className="bg-[#0e1611] text-white">
                      {style}
                    </option>
                  ))}
                </select>
              </div>

              {/* Profile Image URL (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Photo URL (Optional)
                </label>
                <input
                  type="url"
                  name="profile_img"
                  value={formData.profile_img}
                  onChange={handleInputChange}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full px-3.5 py-3 rounded-xl bg-black/50 border border-white/15 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#22c55e]"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-[#15803d] hover:bg-[#166534] active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                    <span>Creating Profile...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">how_to_reg</span>
                    <span>Complete Registration</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= ROSTER / REGISTERED PLAYERS VIEW ================= */}
        {activeTab === 'roster' && (
          <div className="space-y-3">
            {/* Search and Filters */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search player name or jersey #"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#0e1611] border border-white/15 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#22c55e]"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-500 text-base">
                  search
                </span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
              </div>

              {/* Role Filter Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {['All', 'Batter', 'Bowler', 'All-Rounder', 'Wicket-Keeper Batsman'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                      roleFilter === r
                        ? 'bg-[#15803d] text-white border border-emerald-500/50'
                        : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    {r === 'Wicket-Keeper Batsman' ? 'Keeper' : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
              <div className="py-12 text-center text-slate-400">
                <span className="material-symbols-outlined animate-spin text-3xl text-emerald-500">
                  progress_activity
                </span>
                <p className="text-xs mt-2">Loading registered players...</p>
              </div>
            )}

            {/* Connection Error Banner */}
            {!isLoading && fetchError && (
              <div className="py-8 px-5 text-center rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400 mb-3">
                  <span className="material-symbols-outlined text-2xl">cloud_off</span>
                </div>
                <h4 className="font-display font-semibold text-white text-sm">Cannot reach backend server</h4>
                <p className="text-xs text-amber-200/80 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  The frontend cannot connect to <code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-300">http://localhost:3000</code>. Please start your backend server (<code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-300">npm run dev</code> in the Backend folder).
                </p>
                <button
                  type="button"
                  onClick={() => loadPlayers()}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  <span>Retry Connection</span>
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !fetchError && filteredPlayers.length === 0 && (
              <div className="py-12 px-4 text-center rounded-2xl bg-[#0e1611] border border-white/10">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400 mb-3">
                  <span className="material-symbols-outlined text-2xl">person_off</span>
                </div>
                <h4 className="font-display font-semibold text-white text-sm">No players found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  {searchQuery || roleFilter !== 'All'
                    ? 'No players match your search or filter.'
                    : 'No players registered yet. Click below to add the first player.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#15803d] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">person_add</span>
                  <span>Register First Player</span>
                </button>
              </div>
            )}

            {/* Players Cards Grid */}
            <div className="space-y-2.5">
              {filteredPlayers.map((player) => (
                <div
                  key={player._id}
                  className="p-3.5 rounded-2xl bg-[#0e1611] border border-white/10 hover:border-emerald-500/30 transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
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
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#15803d]/25 text-emerald-300 border border-emerald-500/30">
                            {player.role}
                          </span>
                        </div>
                        <h4 className="font-display font-bold text-sm text-white truncate mt-0.5">
                          {player.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate">
                          {player.handed} • {player.bowler_type || 'None'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <div className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-center">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block -mb-0.5">No</span>
                        <span className="font-display font-extrabold text-xs text-white">
                          #{player.jersey_number}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Career Stats Pills & Dropdown Toggle */}
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5">
                    <div className="grid grid-cols-5 gap-1 text-center flex-1">
                      <div className="p-1 rounded bg-black/30">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Mat</span>
                        <span className="font-display font-bold text-xs text-slate-200">
                          {player.total_matches ?? 0}
                        </span>
                      </div>
                      <div className="p-1 rounded bg-black/30">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Runs</span>
                        <span className="font-display font-bold text-xs text-emerald-400">
                          {player.total_runs ?? 0}
                        </span>
                      </div>
                      <div className="p-1 rounded bg-black/30">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Wkts</span>
                        <span className="font-display font-bold text-xs text-slate-200">
                          {player.total_wickets ?? 0}
                        </span>
                      </div>
                      <div className="p-1 rounded bg-black/30">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block">High</span>
                        <span className="font-display font-bold text-xs text-slate-200">
                          {player.highest_runs ?? 0}
                        </span>
                      </div>
                      <div className="p-1 rounded bg-black/30">
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Catches</span>
                        <span className="font-display font-bold text-xs text-slate-200">
                          {player.total_catches ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Dropdown Toggle Button (Circled Area) */}
                    <button
                      type="button"
                      onClick={() => toggleExpandPlayer(player._id)}
                      className={`h-full px-2 py-2 rounded-lg border transition-all flex items-center justify-center shrink-0 ${
                        expandedPlayerIds[player._id]
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-black/30 text-slate-400 hover:text-white hover:bg-white/5 border-white/10'
                      }`}
                      title={expandedPlayerIds[player._id] ? 'Hide complete stats' : 'Show complete player stats'}
                    >
                      <span className="material-symbols-outlined text-base">
                        {expandedPlayerIds[player._id] ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                      </span>
                    </button>
                  </div>

                  {/* Complete Player Data Dropdown Drawer */}
                  {expandedPlayerIds[player._id] && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5 animate-in fade-in duration-200">
                      {/* Batting Detailed */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">sports_cricket</span>
                            Batting Breakdown
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {player.handed}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Fours (4s)</span>
                            <span className="font-display font-bold text-xs text-white">{player.total_four ?? 0}</span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Sixes (6s)</span>
                            <span className="font-display font-bold text-xs text-amber-400">{player.total_six ?? 0}</span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Fifties (50s)</span>
                            <span className="font-display font-bold text-xs text-emerald-300">{player.total_fifty ?? 0}</span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Centuries (100s)</span>
                            <span className="font-display font-bold text-xs text-amber-300">{player.total_centaury ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bowling Detailed */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">sports_baseball</span>
                            Bowling Breakdown
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {player.bowler_type || 'None'}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Wickets</span>
                            <span className="font-display font-bold text-xs text-sky-300">{player.total_wickets ?? 0}</span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Overs</span>
                            <span className="font-display font-bold text-xs text-white">
                              {Math.floor((player.balls_bowled || 0) / 6)}.{(player.balls_bowled || 0) % 6}
                            </span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Runs Given</span>
                            <span className="font-display font-bold text-xs text-rose-300">{player.runs_conceded ?? 0}</span>
                          </div>
                          <div className="p-1 rounded bg-white/5">
                            <span className="text-[8px] uppercase tracking-wider text-slate-400 block">Economy</span>
                            <span className="font-display font-bold text-xs text-slate-200">
                              {(player.balls_bowled || 0) > 0
                                ? ((player.runs_conceded || 0) / ((player.balls_bowled || 0) / 6)).toFixed(2)
                                : '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Fielding & Dismissals */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">sports_handball</span>
                          Fielding Records
                        </span>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Catches: </span>
                            <span className="font-display font-bold text-xs text-white">{player.total_catches ?? 0}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Stumpings: </span>
                            <span className="font-display font-bold text-xs text-white">{player.total_stumpings ?? 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
