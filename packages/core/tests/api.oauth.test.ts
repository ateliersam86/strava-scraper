import { describe, expect, it, vi } from "vitest";
import {
  OAuthError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from "../src/api/oauth.ts";

describe("buildAuthorizeUrl", () => {
  it("includes all required OAuth params", () => {
    const url = buildAuthorizeUrl({
      clientId: "12345",
      redirectUri: "https://app.example.com/oauth/callback",
      scopes: ["activity:read_all", "profile:read_all"],
      state: "csrf-xyz",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.strava.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("12345");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("activity:read_all,profile:read_all");
    expect(u.searchParams.get("state")).toBe("csrf-xyz");
    expect(u.searchParams.get("approval_prompt")).toBe("auto");
  });

  it("supports approval_prompt=force", () => {
    const url = buildAuthorizeUrl({
      clientId: "1",
      redirectUri: "https://x.test",
      scopes: ["read"],
      approvalPrompt: "force",
    });
    expect(new URL(url).searchParams.get("approval_prompt")).toBe("force");
  });
});

describe("exchangeCodeForToken", () => {
  it("POSTs form-encoded body with grant_type=authorization_code", async () => {
    let bodySeen = "";
    const fakeFetch = vi.fn(async (_url, init?: RequestInit) => {
      bodySeen = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_at: 1700000000,
          expires_in: 21600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const tok = await exchangeCodeForToken({
      clientId: "cid",
      clientSecret: "csecret",
      code: "code123",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(tok.access_token).toBe("at");
    expect(bodySeen).toContain("grant_type=authorization_code");
    expect(bodySeen).toContain("code=code123");
    expect(bodySeen).toContain("client_id=cid");
  });

  it("throws OAuthError on non-2xx", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 400 }));
    await expect(
      exchangeCodeForToken({
        clientId: "x",
        clientSecret: "y",
        code: "z",
        fetch: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("refreshAccessToken", () => {
  it("POSTs grant_type=refresh_token with the refresh token", async () => {
    let bodySeen = "";
    const fakeFetch = vi.fn(async (_url, init?: RequestInit) => {
      bodySeen = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          access_token: "new-at",
          refresh_token: "new-rt",
          expires_at: 1700000000,
          expires_in: 21600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const tok = await refreshAccessToken({
      clientId: "c",
      clientSecret: "s",
      refreshToken: "old-rt",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(tok.access_token).toBe("new-at");
    expect(bodySeen).toContain("grant_type=refresh_token");
    expect(bodySeen).toContain("refresh_token=old-rt");
  });
});
