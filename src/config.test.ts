import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("defaults to the mock server on port 4000", () => {
    expect(parseConfig({})).toEqual({ apiUrl: "http://localhost:4000" });
  });

  it("strips trailing slashes", () => {
    expect(parseConfig({ VITE_API_URL: "http://localhost:5000/" }).apiUrl).toBe(
      "http://localhost:5000",
    );
  });

  it("rejects a value that is not a URL", () => {
    expect(() => parseConfig({ VITE_API_URL: "localhost:4000" })).toThrow();
  });
});
