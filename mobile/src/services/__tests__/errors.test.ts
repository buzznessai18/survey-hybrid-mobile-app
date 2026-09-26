import { ApiError, fromHttp, toApiError } from "../api/errors";

describe("error mapping", () => {
  it.each([
    [401, undefined, "unauthorized"],
    [403, "account_inactive", "account_inactive"],
    [403, "forbidden", "forbidden"],
    [404, "not_found", "not_found"],
    [409, "conflict", "conflict"],
    [422, "validation_error", "validation"],
    [429, undefined, "rate_limited"],
    [500, "internal_error", "server"],
    [503, undefined, "server"],
  ])("%s %s -> %s", (status, code, kind) => {
    expect(fromHttp(status, code ? { error: { code, message: "m" } } : null).kind).toBe(kind);
  });

  it("keeps backend field errors for 422", () => {
    const e = fromHttp(422, {
      error: { code: "validation_error", message: "Invalid request", details: { fields: { area: "Area must be greater than 0" } } },
    });
    expect(e.fields).toEqual({ area: "Area must be greater than 0" });
    expect(e.retryable).toBe(false);
  });

  it("uses friendly messages for server errors", () => {
    expect(fromHttp(500, { error: { code: "internal_error", message: "Unexpected database error" } }).message).not.toMatch(/database/);
  });

  it("classifies retryable errors", () => {
    expect(new ApiError("network", "").retryable).toBe(true);
    expect(new ApiError("server", "").retryable).toBe(true);
    expect(new ApiError("validation", "").retryable).toBe(false);
    expect(toApiError(new TypeError("Network request failed")).kind).toBe("network");
    expect(toApiError(new Error("The operation was aborted")).kind).toBe("timeout");
  });
});
