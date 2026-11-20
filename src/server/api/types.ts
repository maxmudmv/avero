import type { AuthenticatedActor } from "@/server/auth/session";

export type AppEnv = {
  Variables: {
    requestId: string;
    ipAddress: string;
    actor: AuthenticatedActor | null;
  };
};
