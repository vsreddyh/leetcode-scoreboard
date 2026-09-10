import mongoose from "mongoose";

function uri() {
  return process.env.MONGODB_URI ?? "";
}

async function connectOnce() {
  const MONGODB_URI = uri();
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set");
  return mongoose.connect(MONGODB_URI);
}

let cached: Promise<typeof mongoose> | undefined;

export async function connectDB() {
  // Retain the promise only on success so a failed first attempt retries later.
  if (cached) {
    await cached.catch(() => undefined);
    if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) return;
    if (mongoose.connection.readyState === mongoose.ConnectionStates.connecting) {
      // Still connecting on the cached promise — wait for it.
      await cached.catch(() => undefined);
      if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) return;
    }
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
