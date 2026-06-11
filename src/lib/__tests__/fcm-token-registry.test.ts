import {
  MAX_FCM_TOKENS,
  mergeFcmToken,
  parseFcmTokens,
  removeFcmToken,
} from "@/lib/fcm-token-registry";
import { resolveAdminFcmTopic } from "@/lib/fcm-topics";

describe("parseFcmTokens", () => {
  it("filtra valores no string y vacíos", () => {
    expect(parseFcmTokens(["a", "", 1, null, "b"])).toEqual(["a", "b"]);
  });

  it("devuelve array vacío si no es array", () => {
    expect(parseFcmTokens(undefined)).toEqual([]);
    expect(parseFcmTokens("x")).toEqual([]);
  });
});

describe("mergeFcmToken", () => {
  it("pone el token nuevo al inicio sin duplicar", () => {
    expect(mergeFcmToken(["old", "mid"], "new")).toEqual(["new", "old", "mid"]);
    expect(mergeFcmToken(["tok"], "tok")).toEqual(["tok"]);
  });

  it("respeta el máximo de tokens", () => {
    const list = Array.from({ length: MAX_FCM_TOKENS }, (_, i) => `t${i}`);
    const merged = mergeFcmToken(list, "fresh");
    expect(merged).toHaveLength(MAX_FCM_TOKENS);
    expect(merged[0]).toBe("fresh");
  });
});

describe("removeFcmToken", () => {
  it("quita solo el token indicado", () => {
    expect(removeFcmToken(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(removeFcmToken(["a", "b"], "x")).toEqual(["a", "b"]);
  });
});

describe("resolveAdminFcmTopic", () => {
  it("usa empresaId y uid del admin", () => {
    const topic = resolveAdminFcmTopic({
      empresaId: "emp-1",
      uid: "admin-9",
      role: "admin",
    });
    expect(topic).toBe("kredi-gasto_emp-1_admin-9");
  });
});
