import mongoose, { Schema } from "mongoose";

const PushSubSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    mode: { type: String, enum: ["per-sync", "per-problem", "twice-daily"], default: "per-sync" },
  },
  { timestamps: true }
);

export const PushSub =
  mongoose.models.PushSub ?? mongoose.model("PushSub", PushSubSchema);