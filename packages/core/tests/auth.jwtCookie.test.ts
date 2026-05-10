import { describe, expect, it, vi } from "vitest";
import { JwtCookieAuth, decodeJwtPayload } from "../src/auth/jwtCookie.ts";
import { JwtExpiredError, LoginFailedError } from "../src/types/auth.ts";

/** Build a fake JWT (unsigned signature is fine — we never verify it). */
function makeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

function base64url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("decodeJwtPayload", () => {
  it("decodes a valid 3-part JWT", () => {
    const future = Math.floor(Date.now() / 1000) + 60 * 60;
    const jwt = makeJwt({ sub: 12345, exp: future, iat: 0 });
    const payload = decodeJwtPayload(jwt);
    expect(payload.sub).toBe(12345);
    expect(payload.exp).toBe(future);
  });

  it("rejects malformed JWT (not 3 parts)", () => {
    expect(() => decodeJwtPayload("not.a.jwt.at.all")).toThrow(/3 dot-separated parts/);
    expect(() => decodeJwtPayload("only-one-part")).toThrow(/3 dot-separated parts/);
  });

  it("rejects payload missing sub or exp", () => {
    const noSub = makeJwt({ exp: 99999 });
    const noExp = makeJwt({ sub: 1 });
    expect(() => decodeJwtPayload(noSub)).toThrow(/missing required fields/);
    expect(() => decodeJwtPayload(noExp)).toThrow(/missing required fields/);
  });

  it("rejects un-base64-decodable payload", () => {
    expect(() => decodeJwtPayload("header.@@@invalid@@@.sig")).toThrow();
  });
});

describe("JwtCookieAuth", () => {
  it("throws JwtExpiredError on past exp", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const auth = new JwtCookieAuth({
      jwt: makeJwt({ sub: 7, exp: past }),
      skipServerValidation: true,
    });
    await expect(auth.prepare()).rejects.toBeInstanceOf(JwtExpiredError);
  });

  it("returns valid cookies when skipServerValidation is true", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    const jwt = makeJwt({ sub: 42, exp: future });
    const auth = new JwtCookieAuth({ jwt, skipServerValidation: true });
    await auth.prepare();
    expect(auth.getAthleteId()).toBe("42");
    expect(auth.getCookies()).toEqual({
      strava_remember_id: "42",
      strava_remember_token: jwt,
    });
  });

  it("validates against /me and accepts a redirect to athlete page", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    const jwt = makeJwt({ sub: 99, exp: future });
    const seenUrls: string[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      seenUrls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.strava.com/athletes/99" },
      });
    });
    const auth = new JwtCookieAuth({ jwt, fetch: fakeFetch as unknown as typeof fetch });
    await auth.prepare();
    expect(fakeFetch).toHaveBeenCalledOnce();
    expect(seenUrls[0]).toContain("/me");
  });

  it("rejects when /me redirects to /login", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    const jwt = makeJwt({ sub: 99, exp: future });
    const fakeFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://www.strava.com/login" },
        }),
    );
    const auth = new JwtCookieAuth({ jwt, fetch: fakeFetch as unknown as typeof fetch });
    await expect(auth.prepare()).rejects.toBeInstanceOf(LoginFailedError);
  });

  it("rejects when redirect athlete id doesn't match JWT sub", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    const jwt = makeJwt({ sub: 99, exp: future });
    const fakeFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://www.strava.com/athletes/100" },
        }),
    );
    const auth = new JwtCookieAuth({ jwt, fetch: fakeFetch as unknown as typeof fetch });
    await expect(auth.prepare()).rejects.toBeInstanceOf(LoginFailedError);
  });

  it("rejects when /me returns non-redirect", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    const jwt = makeJwt({ sub: 99, exp: future });
    const fakeFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const auth = new JwtCookieAuth({ jwt, fetch: fakeFetch as unknown as typeof fetch });
    await expect(auth.prepare()).rejects.toBeInstanceOf(LoginFailedError);
  });
});
