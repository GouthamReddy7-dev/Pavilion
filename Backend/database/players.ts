import mongoose from "mongoose";

export interface IPlayer {
    name: string;
    jersey_number: number;
    role: string;
    handed: string;
    bowler_type?: string;
    profile_img?: string;
    
    // Career Stats (Defaulted to 0)
    total_matches: number;
    total_runs: number;
    highest_runs: number;
    total_four: number;
    total_six: number;
    total_fifty: number;
    total_centaury: number;
    
    // Bowling stats
    total_wickets: number;
    balls_bowled: number;
    runs_conceded: number;
    
    // Fielding stats
    total_catches: number;
    total_stumpings: number;
}

const playerschema = new mongoose.Schema<IPlayer>({
    name: { type: String, required: true },
    jersey_number: { type: Number, required: true },
    role: { type: String, required: true, default: "Batter" },
    handed: { type: String, default: "Right Handed" },
    bowler_type: { type: String, default: "None" },
    profile_img: { type: String, default: "" },

    // Career Stats initialized to 0
    total_matches: { type: Number, default: 0 },
    total_runs: { type: Number, default: 0 },
    highest_runs: { type: Number, default: 0 },
    total_four: { type: Number, default: 0 },
    total_six: { type: Number, default: 0 },
    total_fifty: { type: Number, default: 0 },
    total_centaury: { type: Number, default: 0 },

    total_wickets: { type: Number, default: 0 },
    balls_bowled: { type: Number, default: 0 },
    runs_conceded: { type: Number, default: 0 },

    total_catches: { type: Number, default: 0 },
    total_stumpings: { type: Number, default: 0 },
}, {
    timestamps: true
});

const playermodel = mongoose.model<IPlayer>("playernames", playerschema);

export default playermodel;