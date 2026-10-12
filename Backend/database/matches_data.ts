import mongoose, { Schema } from "mongoose";

export interface IPlayerMatchStats {
    player_id: mongoose.Types.ObjectId | string;
    dismissal_info?: string;
    runs?: number;
    balls?: number;
    fours?: number;
    sixes?: number;
    strike_rate?: number;
}

export interface IBowlerMatchStats {
    player_id: mongoose.Types.ObjectId | string;
    overs?: number;
    balls_bowled?: number;
    maidens?: number;
    runs?: number;
    wickets?: number;
    economy?: number;
}

export interface IMatchData {
    match_id: string;
    team_name: string;
    opponent_name: string;
    runs?: number;
    wickets?: number;
    overs?: number;
    players_stats?: IPlayerMatchStats[];
    bowlers_stats?: IBowlerMatchStats[];
    createdAt?: Date;
    updatedAt?: Date;
}

const bowlerMatchStatsSchema = new mongoose.Schema<IBowlerMatchStats>({
    player_id: {
        type: Schema.Types.ObjectId,
        ref: "playernames",
        required: true,
    },
    overs: {
        type: Number,
        default: 0,
    },
    balls_bowled: {
        type: Number,
        default: 0,
    },
    maidens: {
        type: Number,
        default: 0,
    },
    runs: {
        type: Number,
        default: 0,
    },
    wickets: {
        type: Number,
        default: 0,
    },
    economy: {
        type: Number,
        default: 0,
    },
}, { _id: false });

const playerMatchStatsSchema = new mongoose.Schema<IPlayerMatchStats>({
    player_id: {
        type: Schema.Types.ObjectId,
        ref: "playernames",
        required: true,
    },
    dismissal_info: {
        type: String,
        default: "not out",
    },
    runs: {
        type: Number,
        default: 0,
    },
    balls: {
        type: Number,
        default: 0,
    },
    fours: {
        type: Number,
        default: 0,
    },
    sixes: {
        type: Number,
        default: 0,
    },
    strike_rate: {
        type: Number,
        default: 0,
    },
}, { _id: false });

const matchDataSchema = new mongoose.Schema<IMatchData>({
    match_id: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    team_name: {
        type: String,
        required: true,
        trim: true,
    },
    opponent_name: {
        type: String,
        required: true,
        trim: true,
    },
    runs: {
        type: Number,
        default: 0,
    },
    wickets: {
        type: Number,
        default: 0,
    },
    overs: {
        type: Number,
        default: 0,
    },
    players_stats: {
        type: [playerMatchStatsSchema],
        default: [],
    },
    bowlers_stats: {
        type: [bowlerMatchStatsSchema],
        default: [],
    },
}, {
    timestamps: true,
});

const matchDataModel = mongoose.model<IMatchData>("matches_data", matchDataSchema, "matches_data");

export default matchDataModel;
