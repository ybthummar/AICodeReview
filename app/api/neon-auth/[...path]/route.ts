import { getNeonAuth, NeonAuthConfigurationError } from "@/lib/neon-auth";

type ManagedHandlers = ReturnType<ReturnType<typeof getNeonAuth>["handler"]>;
type RouteContext = Parameters<ManagedHandlers["GET"]>[1];
type Method = keyof ManagedHandlers;

function createHandler(method: Method) {
  return async (request: Request, context: RouteContext) => {
    try {
      return await getNeonAuth().handler()[method](request, context);
    } catch (error) {
      if (!(error instanceof NeonAuthConfigurationError)) throw error;

      console.error("[auth/neon]", { code: "configuration_missing" });
      return Response.json(
        { code: "auth_not_configured", message: error.message },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

export const GET = createHandler("GET");
export const POST = createHandler("POST");
export const PUT = createHandler("PUT");
export const PATCH = createHandler("PATCH");
export const DELETE = createHandler("DELETE");
