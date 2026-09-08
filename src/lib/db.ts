import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";

let cached = (global as { __mongoose?: Promise<typeof mongoose> }).__mongoose;

export async function connectDB() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set");
  if (!cached) {
    cached = mongoose.connect(MONGODB_URI);
    (global as { __mongoose?: Promise<typeof mongoose> }).__mongoose = cached;
  }
  return cached;
}
