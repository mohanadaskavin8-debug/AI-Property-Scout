import { Router, type IRouter } from "express";
import { AddFavoriteBody, RemoveFavoriteParams } from "@workspace/api-zod";
import { db, favoritesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/favorites", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const favorites = await db
    .select()
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, userId))
    .orderBy(desc(favoritesTable.createdAt));

  res.json(
    favorites.map((f) => ({
      id: f.id,
      propertyData: f.propertyData,
      createdAt: f.createdAt.toISOString(),
    })),
  );
});

router.post("/favorites", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = AddFavoriteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [inserted] = await db
    .insert(favoritesTable)
    .values({ userId, propertyData: parsed.data.propertyData })
    .returning();

  res.status(201).json({
    id: inserted.id,
    propertyData: inserted.propertyData,
    createdAt: inserted.createdAt.toISOString(),
  });
});

router.delete("/favorites/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RemoveFavoriteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(favoritesTable)
    .where(
      and(eq(favoritesTable.id, params.data.id), eq(favoritesTable.userId, userId)),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Favorite not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
