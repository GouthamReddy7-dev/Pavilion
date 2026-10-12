import express from "express";
import http from "http";
import mongoose from "mongoose";
import cors from "cors";
import playermodel from "./database/players.ts";
import teammodel from "./database/team.ts";
import teamMatchesModel from "./database/team_matches.ts";
import matchDataModel from "./database/matches_data.ts";
import type { Request, Response } from "express";
import "dotenv/config";

const conn_string = process.env.Conn_String;
const app = express();
const server = http.createServer(app);

// Graceful Socket.IO attachment if installed
try {
  let socketModule: any = await import("socket.io").catch(() => null);
  if (!socketModule) {
    socketModule = await import("../Frontend/cricket-frontend/node_modules/socket.io/dist/index.js").catch(() => null);
  }
  if (socketModule && (socketModule.Server || socketModule.default)) {
    const SocketServer = socketModule.Server || socketModule.default;
    const io = new SocketServer(server, {
      cors: { origin: "*" },
    });
    (global as any).io = io;
    io.on("connection", (socket: any) => {
      console.log("Socket client connected:", socket.id);
    });
    console.log("Socket.IO initialized successfully");
  }
} catch {
  // Socket.io fallback
}

app.use(express.json());
app.use(cors());

if (!conn_string) {
  throw new Error("MONGO_URI is missing from .env");
}

mongoose.connect(conn_string)
  .then(() => {
    console.log("Connected to MongoDB successfully");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    mongoState: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ==================== PLAYER ROUTES ====================

// Get all players
app.get("/players", async (req: Request, res: Response) => {
  try {
    let players = await playermodel.find().sort({ createdAt: -1 });

    // Fallback: If 'playernames' collection is empty, check 'players' collection
    if (players.length === 0 && mongoose.connection.db) {
      const altCollection = mongoose.connection.db.collection("players");
      const altPlayers = await altCollection.find().sort({ createdAt: -1 }).toArray();
      if (altPlayers.length > 0) {
        players = altPlayers as any;
      }
    }

    res.status(200).json({ status: "Success", data: players });
  } catch (err: any) {
    console.error("Error fetching players:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Get single player by id
app.get("/players/:id", async (req: Request, res: Response) => {
  try {
    const player = await playermodel.findById(req.params.id);
    if (!player) {
      return res.status(404).json({ status: "error", message: "Player not found" });
    }
    res.status(200).json({ status: "Success", data: player });
  } catch (err: any) {
    console.error("Error fetching player:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Add player (stats initialized to 0 automatically by schema defaults)
app.post("/add_player", async (req: Request, res: Response) => {
  try {
    const { name, jersey_number, role, handed, bowler_type, profile_img } = req.body;

    // Explicitly enforce default 0 for stats on new registrations
    const newPlayerData = {
      name,
      jersey_number: Number(jersey_number),
      role: role || "Batter",
      handed: handed || "Right Handed",
      bowler_type: bowler_type || "None",
      profile_img: profile_img || "",
      total_matches: 0,
      total_runs: 0,
      highest_runs: 0,
      total_four: 0,
      total_six: 0,
      total_fifty: 0,
      total_centaury: 0,
      total_wickets: 0,
      balls_bowled: 0,
      runs_conceded: 0,
      total_catches: 0,
      total_stumpings: 0,
    };

    const createdPlayer = await playermodel.create(newPlayerData);
    console.log("Player created successfully:", createdPlayer.name);
    res.status(201).json({ status: "Success", data: createdPlayer });
  } catch (err: any) {
    console.error("Error adding player:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Delete player
app.delete("/players/:id", async (req: Request, res: Response) => {
  try {
    await playermodel.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "Success", message: "Player deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting player:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================== TEAM ROUTES ====================

// Add team
app.post("/add_team", (req: Request, res: Response) => {
  teammodel.create(req.body)
    .then((createdTeam) => {
      console.log("Team created:", createdTeam);
      res.status(201).json({ status: "Success", data: createdTeam });
    })
    .catch((err) => {
      console.error("Error creating team:", err);
      res.status(500).json({ status: "error", message: err.message });
    });
});

// Get team
app.post("/get_team", (req: Request, res: Response) => {
  const { team_id } = req.body;
  teammodel.findOne({ _id: team_id })
    .then((data) => {
      res.status(200).json(data);
    })
    .catch((err) => {
      console.error("Error getting team:", err);
      res.status(500).json({ status: "error", message: err.message });
    });
});

// Get all teams
app.get("/teams", async (req: Request, res: Response) => {
  try {
    let teams = await teammodel.find().sort({ _id: -1 }).lean();

    // Fallback: If empty, check alternate collection names (e.g. 'teams', 'teamdb')
    if (teams.length === 0 && mongoose.connection.db) {
      for (const colName of ["teams", "teamdb", "teamdbs"]) {
        const col = mongoose.connection.db.collection(colName);
        const found = await col.find().sort({ _id: -1 }).toArray();
        if (found.length > 0) {
          teams = found as any;
          break;
        }
      }
    }

    console.log(`Fetched ${teams.length} teams from database`);
    res.status(200).json({ status: "Success", data: teams });
  } catch (err: any) {
    console.error("Error fetching teams:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Delete team
app.delete("/teams/:id", async (req: Request, res: Response) => {
  try {
    await teammodel.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "Success", message: "Team deleted successfully" });
  } catch (err: any) {
    console.error("Error deleting team:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================== MATCH ROUTES ====================

  // Create match (Matchmaking)
  app.post("/create_match", async (req: Request, res: Response) => {
    try {
      const { team_name, opponent_team_name, custom_match_id } = req.body;
      if (!team_name || !opponent_team_name) {
        return res.status(400).json({ status: "error", message: "Both team names are required" });
      }

      const match_id = custom_match_id?.trim() || `M-${Math.floor(1000 + Math.random() * 9000)}`;

      const createdMatch = await teamMatchesModel.create({
        match_id,
        team_name,
        opponent_team_name,
        status: "scheduled",
      });

      console.log("Match created:", createdMatch.match_id);
      res.status(201).json({ status: "Success", data: createdMatch });
    } catch (err: any) {
      console.error("Error creating match:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Get all matches
  app.get("/matches", async (req: Request, res: Response) => {
    try {
      const matches = await teamMatchesModel.find().sort({ _id: -1 }).lean();
      res.status(200).json({ status: "Success", data: matches });
    } catch (err: any) {
      console.error("Error fetching matches:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Get match and scorecard by match_id
  app.get("/match/:match_id", async (req: Request, res: Response) => {
    try {
      const { match_id } = req.params;
      const match = await teamMatchesModel.findOne({ match_id }).lean();
      if (!match) {
        return res.status(404).json({ status: "error", message: "Match not found" });
      }

      // Fetch scorecards from matches_data
      let matchData = await matchDataModel.find({ match_id })
        .populate("players_stats.player_id")
        .populate("bowlers_stats.player_id")
        .lean();

      res.status(200).json({
        status: "Success",
        match,
        match_data: matchData,
      });
    } catch (err: any) {
      console.error("Error fetching match details:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Insert or update scorecard data in matches_data
  app.post("/matches_data", async (req: Request, res: Response) => {
    try {
      const created = await matchDataModel.create(req.body);
      res.status(201).json({ status: "Success", data: created });
    } catch (err: any) {
      console.error("Error inserting match data:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // Umpire / Score Adder Ball Action
  app.post("/record_ball", async (req: Request, res: Response) => {
    try {
      const {
        match_id,
        batting_team,
        bowling_team,
        striker_id,
        non_striker_id,
        bowler_id,
        ball_type, // 'runs' | 'out' | 'wide' | 'no_ball'
        runs = 0,
        dismissal_text,
      } = req.body;

      if (!match_id || !batting_team) {
        return res.status(400).json({ status: "error", message: "match_id and batting_team are required" });
      }

      // 1. Find or create the scorecard for this match and batting team
      let scorecard = await matchDataModel.findOne({ match_id, team_name: batting_team });
      if (!scorecard) {
        scorecard = await matchDataModel.create({
          match_id,
          team_name: batting_team,
          opponent_name: bowling_team || "",
          runs: 0,
          wickets: 0,
          overs: 0,
          players_stats: [],
        });
      }

      const runsAdded = Number(runs) || 0;
      const isWide = ball_type === "wide";
      const isNoBall = ball_type === "no_ball";
      const isOut = ball_type === "out";
      const isLegalBall = !isWide && !isNoBall;
      const extraRun = isWide || isNoBall ? 1 : 0;

      // Update team total runs and wickets
      scorecard.runs = (scorecard.runs || 0) + runsAdded + extraRun;
      if (isOut) {
        scorecard.wickets = (scorecard.wickets || 0) + 1;
      }

      // Update team overs (6 legal balls per over)
      const currentOvers = scorecard.overs || 0;
      const wholeOvers = Math.floor(currentOvers);
      const currBallsInOver = Math.round((currentOvers - wholeOvers) * 10);
      let totalLegalBalls = wholeOvers * 6 + currBallsInOver;

      if (isLegalBall) {
        totalLegalBalls += 1;
        const newWholeOvers = Math.floor(totalLegalBalls / 6);
        const newBallsInOver = totalLegalBalls % 6;
        scorecard.overs = Number(`${newWholeOvers}.${newBallsInOver}`);
      }

      // 2. Update Striker's scorecard stats
      if (striker_id) {
        let pStat: any = scorecard.players_stats?.find(
          (p: any) => String(p.player_id) === String(striker_id)
        );

        if (!pStat) {
          pStat = {
            player_id: striker_id,
            dismissal_info: "not out",
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            strike_rate: 0,
          };
          scorecard.players_stats?.push(pStat);
        }

        if (!isWide) {
          pStat.balls = (pStat.balls || 0) + 1;
        }

        pStat.runs = (pStat.runs || 0) + runsAdded;
        if (runsAdded === 4) pStat.fours = (pStat.fours || 0) + 1;
        if (runsAdded === 6) pStat.sixes = (pStat.sixes || 0) + 1;

        if (isOut) {
          pStat.dismissal_info = dismissal_text || "out";
        }

        pStat.strike_rate = pStat.balls && pStat.balls > 0
          ? Number(((pStat.runs / pStat.balls) * 100).toFixed(1))
          : 0;
      }

      // 3. Update Bowler's scorecard stats
      if (bowler_id) {
        if (!scorecard.bowlers_stats) {
          scorecard.bowlers_stats = [];
        }
        let bStat: any = scorecard.bowlers_stats.find((b: any) => {
          const pid = b.player_id?._id ? b.player_id._id.toString() : b.player_id?.toString();
          return pid === String(bowler_id);
        });

        if (!bStat) {
          bStat = {
            player_id: bowler_id,
            overs: 0,
            balls_bowled: 0,
            maidens: 0,
            runs: 0,
            wickets: 0,
            economy: 0,
          };
          scorecard.bowlers_stats.push(bStat);
          bStat = scorecard.bowlers_stats[scorecard.bowlers_stats.length - 1];
        }

        if (isLegalBall) {
          bStat.balls_bowled = (bStat.balls_bowled || 0) + 1;
          const wholeB = Math.floor(bStat.balls_bowled / 6);
          const remB = bStat.balls_bowled % 6;
          bStat.overs = Number(`${wholeB}.${remB}`);
        }

        bStat.runs = (bStat.runs || 0) + runsAdded + extraRun;
        if (isOut) {
          bStat.wickets = (bStat.wickets || 0) + 1;
        }

        const oversDecimal = (bStat.balls_bowled || 0) / 6;
        bStat.economy = oversDecimal > 0
          ? Number(((bStat.runs || 0) / oversDecimal).toFixed(2))
          : 0;

        scorecard.markModified("bowlers_stats");
      }

      scorecard.markModified("players_stats");
      await scorecard.save();

      // 4. Update Player's Lifetime Career Stats in database
      if (striker_id) {
        const strikerInc: any = {
          total_runs: runsAdded,
          total_four: runsAdded === 4 ? 1 : 0,
          total_six: runsAdded === 6 ? 1 : 0,
        };
        await playermodel.findByIdAndUpdate(striker_id, { $inc: strikerInc }).catch(() => {});
      }

      if (bowler_id) {
        const bowlerInc: any = {
          runs_conceded: runsAdded + extraRun,
          balls_bowled: isLegalBall ? 1 : 0,
          total_wickets: isOut ? 1 : 0,
        };
        await playermodel.findByIdAndUpdate(bowler_id, { $inc: bowlerInc }).catch(() => {});
      }

      // 5. Emit live update event if socket is active
      const populated = await matchDataModel.findById(scorecard._id)
        .populate("players_stats.player_id")
        .populate("bowlers_stats.player_id")
        .lean();
      if ((global as any).io) {
        (global as any).io.emit("score_update", {
          match_id,
          scorecard: populated || scorecard,
        });
      }

      res.status(200).json({ status: "Success", data: populated || scorecard });
    } catch (err: any) {
      console.error("Error recording ball:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // End Innings endpoint
  app.post("/end_innings", async (req: Request, res: Response) => {
    try {
      const { match_id, batting_team, runs, wickets, overs } = req.body;
      const target = (Number(runs) || 0) + 1;

      const match = await teamMatchesModel.findOneAndUpdate(
        { match_id },
        { target_runs: target, status: "innings_break" },
        { new: true }
      );

      const payload = {
        match_id,
        batting_team,
        runs: Number(runs) || 0,
        wickets: Number(wickets) || 0,
        overs: Number(overs) || 0,
        target,
        match,
      };

      if ((global as any).io) {
        (global as any).io.emit("innings_ended", payload);
      }

      res.status(200).json({ status: "Success", data: payload });
    } catch (err: any) {
      console.error("Error ending innings:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // End Match endpoint
  app.post("/end_match", async (req: Request, res: Response) => {
    try {
      const { match_id, winner, win_margin } = req.body;

      const match = await teamMatchesModel.findOneAndUpdate(
        { match_id },
        { status: "completed", winner: winner || "Match Tied", win_margin: win_margin || "" },
        { new: true }
      );

      const payload = {
        match_id,
        status: "completed",
        winner: winner || "Match Tied",
        win_margin: win_margin || "",
        match,
      };

      if ((global as any).io) {
        (global as any).io.emit("match_ended", payload);
      }

      res.status(200).json({ status: "Success", data: payload });
    } catch (err: any) {
      console.error("Error ending match:", err);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});