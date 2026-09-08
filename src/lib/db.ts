import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";

async function connectOnce() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set");
  return mongoose.connect(MONGODB_URI);
}

let cached: Promise<typeof mongoose> | undefined;

export async function connectDB() {
  // Retain the promise only on success so a failed first attempt retries later.
  if (cached) {
    await cached.catch(() => undefined);
    if (mongoose.connection.readyState >= 2) return;
    cached = undefined;
  }
  cached = connectOnce();
  try {
    await cached;
  } catch (err) {
    cached = undefined;
    throw err;
  }
}
