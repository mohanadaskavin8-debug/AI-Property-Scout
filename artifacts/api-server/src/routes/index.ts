import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import favoritesRouter from "./favorites";
import marketRouter from "./market";
import openaiRouter from "./openai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(favoritesRouter);
router.use(marketRouter);
router.use(openaiRouter);

export default router;
