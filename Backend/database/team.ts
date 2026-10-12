import mongoose, { Schema } from "mongoose";

interface team {
    team_name: string;
    team_players?: (mongoose.Types.ObjectId | string)[];
}

const teamschema = new mongoose.Schema<team>({
    team_name: {
        type: String,
        required: true,
    },
    team_players: [{
        type: Schema.Types.ObjectId,
        ref: "playernames",
    }],
}, {
    timestamps: true,
});

const teammodel = mongoose.model("teamdb", teamschema);

export default teammodel
