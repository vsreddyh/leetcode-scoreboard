import mongoose, { Schema } from "mongoose";

const TrackedUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true }
);

export const TrackedUser =
  mongoose.models.TrackedUser ?? mongoose.model("TrackedUser", TrackedUserSchema);
