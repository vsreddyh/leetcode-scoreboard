import mongoose, { Schema } from "mongoose";

// One doc per user+question (score stored per question, not per submission).
// timestamp/date = FIRST Accepted time; resubmits don't create new docs.
const SubmissionSchema = new Schema(
  {
    username: { type: String, index: true, required: true },
    title: String,
    titleSlug: { type: String, required: true },
    timestamp: { type: Number, required: true },
    date: { type: String, index: true, required: true }, // YYYY-MM-DD of first accept (IST)
    status: { type: String, default: "Accepted" },
    lang: String,
    acRate: { type: Number, default: null },
    score: { type: Number, default: 0 }, // 100 - acRate
    submissions: { type: Number, default: 1 }, // how many Accepted submissions seen
  },
  { timestamps: true }
);

SubmissionSchema.index({ username: 1, titleSlug: 1 }, { unique: true });

export const Submission =
  mongoose.models.Submission ?? mongoose.model("Submission", SubmissionSchema);
