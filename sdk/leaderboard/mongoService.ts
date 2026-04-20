import type { Collection, Document } from "mongodb";
import type { LeaderboardConfig, PlayerScore, PersistenceServiceLike } from "./types";

function validateFieldName(value: string, field: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `[Leaderboard] Invalid MongoDB field for "${field}": "${value}". Only alphanumeric characters and underscores are allowed.`
    );
  }
}

export class MongoDBService implements PersistenceServiceLike {
  private collection: Collection<Document>;
  private config: LeaderboardConfig;

  constructor(collection: Collection<Document>, config: LeaderboardConfig) {
    validateFieldName(config.columns.gameId, "columns.gameId");
    validateFieldName(config.columns.userId, "columns.userId");
    validateFieldName(config.columns.score, "columns.score");

    this.collection = collection;
    this.config = config;
  }

  async upsertScore(gameId: string, userId: string, score: number): Promise<void> {
    const { columns } = this.config;

    await this.collection.updateOne(
      { [columns.gameId]: gameId, [columns.userId]: userId },
      {
        $setOnInsert: {
          [columns.gameId]: gameId,
          [columns.userId]: userId,
        },
        $max: {
          [columns.score]: score,
        },
      },
      { upsert: true }
    );
  }

  async bulkUpsert(
    writes: Array<{ gameId: string; userId: string; score: number }>
  ): Promise<void> {
    if (!writes.length) return;

    const { columns } = this.config;

    await this.collection.bulkWrite(
      writes.map((write) => ({
        updateOne: {
          filter: {
            [columns.gameId]: write.gameId,
            [columns.userId]: write.userId,
          },
          update: {
            $setOnInsert: {
              [columns.gameId]: write.gameId,
              [columns.userId]: write.userId,
            },
            $max: {
              [columns.score]: write.score,
            },
          },
          upsert: true,
        },
      }))
    );
  }

  async getTop(gameId: string, limit: number): Promise<PlayerScore[]> {
    const { columns } = this.config;

    const docs = await this.collection
      .find({ [columns.gameId]: gameId })
      .sort({ [columns.score]: -1 })
      .limit(limit)
      .project({ [columns.userId]: 1, [columns.score]: 1, _id: 0 })
      .toArray();

    return docs.map((doc) => ({
      gameId,
      userId: String(doc[columns.userId]),
      score: Number(doc[columns.score]),
    }));
  }

  async getRank(gameId: string, userId: string): Promise<number | null> {
    const { columns } = this.config;

    const current = await this.collection.findOne(
      { [columns.gameId]: gameId, [columns.userId]: userId },
      { projection: { [columns.score]: 1, _id: 0 } }
    );

    if (!current) return null;

    const currentScore = Number(current[columns.score]);
    if (!Number.isFinite(currentScore)) return null;

    const higherCount = await this.collection.countDocuments({
      [columns.gameId]: gameId,
      [columns.score]: { $gt: currentScore },
    });

    return higherCount + 1;
  }
}
