import http from "node:http";
import https from "node:https";
import { limitBuildFontRequests } from "./lib/build-font-http-limits.mjs";

limitBuildFontRequests(http);
limitBuildFontRequests(https);
