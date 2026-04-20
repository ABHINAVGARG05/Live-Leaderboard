import { MongoClient } from "mongodb";

export async function createMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Missing MongoDB connection string. Set MONGODB_URL or MONGODB_URI.",
    );
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  console.log("Connected to MongoDB");

  return client;
}
