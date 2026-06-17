import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import favoritesRouter from "./favorites";
import marketRouter from "./market";
import openaiRouter from "./openai";
import savedSearchesRouter from "./saved-searches";
import visitedPropertiesRouter from "./visited-properties";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(favoritesRouter);
router.use(marketRouter);
router.use(openaiRouter);
router.use(savedSearchesRouter);
router.use(visitedPropertiesRouter);
router.use(notificationsRouter);

export default router;
