import { describe, expect, it } from "vitest";
import { accountDisplayName } from "@/lib/account-name";

describe("accountDisplayName", () => {
  it("uses the first name when the account has one, as Google sign-ins do", () => {
    expect(accountDisplayName({ name: "Catherine Okonkwo", email: "c.okonkwo@example.test" })).toBe(
      "Catherine"
    );
  });

  it("keeps a single-word name whole", () => {
    expect(accountDisplayName({ name: "Prince", email: "p@example.test" })).toBe("Prince");
  });

  it("takes the part before the @ when there is no name", () => {
    // The email-code route stores name: "" — see the note in account-name.ts.
    for (const name of ["", "   ", undefined, null]) {
      expect(accountDisplayName({ name, email: "quizmaster@example.test" }), `name=${JSON.stringify(name)}`).toBe(
        "quizmaster"
      );
    }
  });

  it("ignores a name that is just the address again", () => {
    // Some providers fill the field with the address rather than leaving it
    // empty; that is no more of a name than the address itself.
    expect(accountDisplayName({ name: "host@example.test", email: "host@example.test" })).toBe("host");
  });

  it("splits a local part that contains an @ at the domain separator", () => {
    expect(accountDisplayName({ name: "", email: '"odd@name"@example.test' })).toBe('"odd@name"');
  });

  it("never returns an empty string while there is an address to show", () => {
    expect(accountDisplayName({ name: "", email: "@example.test" })).toBe("@example.test");
    expect(accountDisplayName({ name: "", email: "nodomain" })).toBe("nodomain");
  });

  it("trims the surrounding whitespace a provider may have stored", () => {
    expect(accountDisplayName({ name: "  Paul  Cohen ", email: "p@example.test" })).toBe("Paul");
  });
});
