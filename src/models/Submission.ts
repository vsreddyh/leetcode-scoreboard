import mongoose, { Schema } from "mongoose";

const SubmissionSchema = new Schema(
  {
    username: { type: String, index: true, required: true },
    title: String,
    titleSlug: { type: String, required: true },
    timestamp: { type: Number, required: true },
    date: { type: String, index: true, required: true },
    status: { type: String, default: "Accepted" },
    lang: String,
    acRate: { type: Number, default: null },
    difficulty: { type: String, default: null },
    score: { type: Number, default: 0 },
    submissions: { type: Number, default: 1 },
  },
  { timestamps: true }
);

SubmissionSchema.index({ username: 1, titleSlug: 1 }, { unique: true });
// Covers the status+date match in lib/scores.ts (the {date,score,_id} ordering
// stays an in-memory sort after the match).
SubmissionSchema.index({ status: 1, date: 1 });
// Future index pass (needs syncIndexes to drop existing): the single-field
// username/date indexes are prefix-covered by the compounds above; consider a
// titleSlug-leading index for refreshDayScores' distinct/updateMany per date.

export const Submission =
  mongoose.models.Submission ?? mongoose.model("Submission", SubmissionSchema);