/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as engine from "../engine.js";
import type * as halls from "../halls.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as kits from "../kits.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_turn from "../lib/turn.js";
import type * as memories from "../memories.js";
import type * as messages from "../messages.js";
import type * as projects from "../projects.js";
import type * as prompt from "../prompt.js";
import type * as studio from "../studio.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  engine: typeof engine;
  halls: typeof halls;
  http: typeof http;
  identity: typeof identity;
  kits: typeof kits;
  "lib/owner": typeof lib_owner;
  "lib/turn": typeof lib_turn;
  memories: typeof memories;
  messages: typeof messages;
  projects: typeof projects;
  prompt: typeof prompt;
  studio: typeof studio;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
