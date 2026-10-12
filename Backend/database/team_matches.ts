import mongoose from "mongoose";

export interface ITeamMatch {
    match_id: string;
    team_name: string;
    opponent_team_name: string;
    status: string;
    winner?: string;
    win_margin?: string;
    target_runs?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const teamMatchesSchema = new mongoose.Schema<ITeamMatch>({
    match_id: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    team_name: {
        type: String,
        required: true,
        trim: true,
    },
    opponent_team_name: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        default: "scheduled",
    },
    winner: {
        type: String,
        default: "",
    },
    win_margin: {
        type: String,
        default: "",
    },
    target_runs: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

const teamMatchesModel = mongoose.model<ITeamMatch>("team_matches", teamMatchesSchema, "team_matches");

export default teamMatchesModel;
