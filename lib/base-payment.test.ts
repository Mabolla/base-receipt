import { describe, expect, it } from "vitest";
import { Attribution } from "ox/erc8021";
import { BUILDER_CODE, DATA_SUFFIX, buildAttributedTransferData } from "./base-payment";

describe("buildAttributedTransferData", () => {
  it("physically appends the Base Receipt ERC-8021 suffix", () => {
    const data = buildAttributedTransferData(
      "0.01",
      "0x94705A9d675daa924F9190Eca4c05ED6B12d5345",
    );

    expect(data.endsWith(DATA_SUFFIX.slice(2))).toBe(true);
    expect(Attribution.fromData(data)).toEqual({ id: 0, codes: [BUILDER_CODE] });
  });
});
