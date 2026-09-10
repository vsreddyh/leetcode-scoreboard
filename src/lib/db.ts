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
    // readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
    if (mongoose.connection.readyState === 1) return;
    if (mongoose.connection.readyState === 2) {
      // Still connecting on the cached promise — wait for it.
      await cached.catch(() => undefined);
      if (mongoose.connection.readyState === 1) return;
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
