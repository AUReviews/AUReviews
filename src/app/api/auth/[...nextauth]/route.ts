// Auth.js route handler (issue #19). Exposes the magic-link request and callback
// endpoints. All policy (domain gate, rate limits, hashing) lives in the config
// in src/auth; this file only mounts the handlers.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
