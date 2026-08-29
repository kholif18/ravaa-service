import { Hono } from "hono";

export type AppEnv = {
  Variables: {};
};

export function createRouter() {
  return new Hono<AppEnv>();
}
