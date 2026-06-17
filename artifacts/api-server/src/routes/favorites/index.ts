import { Router, type IRouter } from "express";
import { AddFavoriteBody, RemoveFavoriteParams } from "@workspace/api-zod";
import { db, favoritesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/favorites", async (_req, res): Promise<void> => {
  const favorites = await db
    .select()
    .from(favoritesTable)
    .orderBy(desc(favoritesTable.createdAt));

  res.json(
    favorites.map((f) => ({
      id: f.id,
      propertyData: f.propertyData,
      createdAt: f.createdAt.toISOString(),
    }))
  );
});

router.post("/favorites", async (req, res): Promise<void> => {
  const parsed = AddFavoriteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [inserted] = await db
    .insert(favoritesTable)
    .values({ propertyData: parsed.data.propertyData })
    .returning();

  res.status(201).json({
    id: inserted.id,
    propertyData: inserted.propertyData,
    createdAt: inserted.createdAt.toISOString(),
  });
});

router.delete("/favorites/:id", async (req, res): Promise<void> => {
  const params = RemoveFavoriteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(favoritesTable)
    .where(eq(favoritesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Favorite not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
