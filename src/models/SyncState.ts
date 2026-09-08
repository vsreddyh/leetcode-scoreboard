import mongoose, { Schema } from "mongoose";

// Tiny key/value store for cross-invocation flags (serverless has no
// persistent memory). Used e.g. to run the EOD refresh exactly once per day.
const SyncStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
  },
  { timestamps: true }
);

export const SyncState =
  mongoose.models.SyncState ?? mongoose.model("SyncState", SyncStateSchema);
