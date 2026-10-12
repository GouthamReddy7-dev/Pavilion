import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { PlayerAddPage } from './pages/PlayerAddPage';
import { TeamCreatePage } from './pages/TeamCreatePage';
import { MatchmakingPage } from './pages/MatchmakingPage';
import { UmpireConsolePage } from './pages/UmpireConsolePage';

function NavigationBar() {
  return (
    <nav className="bg-[#0b130e] border-b border-white/10 px-4 py-2 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
            🏏
          </div>
          <span className="font-display font-extrabold text-sm tracking-wider uppercase text-white">
            Pavilion
          </span>
        </NavLink>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`
            }
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>Players Hub</span>
          </NavLink>

          <NavLink
            to="/teams"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`
            }
          >
            <span className="material-symbols-outlined text-sm">groups</span>
            <span>Team Builder</span>
          </NavLink>

          <NavLink
            to="/matches"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`
            }
          >
            <span className="material-symbols-outlined text-sm">handshake</span>
            <span>Matchmaking</span>
          </NavLink>

          <NavLink
            to="/umpire"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-amber-400 hover:text-white'
              }`
            }
          >
            <span className="material-symbols-outlined text-sm">sports</span>
            <span>Umpire Console</span>
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#080d0a] text-slate-100 flex flex-col justify-between">
        <NavigationBar />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<PlayerAddPage />} />
            <Route path="/players" element={<PlayerAddPage />} />
            <Route path="/teams" element={<TeamCreatePage />} />
            <Route path="/matches" element={<MatchmakingPage />} />
            <Route path="/matchmaking" element={<MatchmakingPage />} />
            <Route path="/umpire" element={<UmpireConsolePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
