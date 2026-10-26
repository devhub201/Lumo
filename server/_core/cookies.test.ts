import { afterEach, describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./cookies";

const previousNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

describe("session cookie policy", () => {
  it("uses secure first-party cookies in production", () => {
    process.env.NODE_ENV = "production";
    expect(getSessionCookieOptions({} as never)).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("preserves cross-site preview cookies outside production", () => {
    process.env.NODE_ENV = "test";
    expect(getSessionCookieOptions({} as never).sameSite).toBe("none");
  });
});
