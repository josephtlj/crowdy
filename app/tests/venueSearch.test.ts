import assert from "node:assert/strict";
import { test } from "node:test";
import { venueSearchRank } from "../src/services/venueSearch";

const vivo = { name: "VivoCity", address: "1 HARBOURFRONT WALK VIVOCITY SINGAPORE 098585", postalCode: "098585" };
const vivoMall = { name: "The Vivo Mall", address: "10 EXAMPLE ROAD SINGAPORE 111111", postalCode: "111111" };
const ion = { name: "ION Orchard", address: "2 ORCHARD TURN ION ORCHARD SINGAPORE 238801", postalCode: "238801" };
const centrepoint = {
  name: "The Centrepoint",
  address: "176 ORCHARD ROAD AMB AQUATIC HUB THE CENTREPOINT",
  postalCode: undefined,
};

test("a name prefix outranks a name that only contains the query", () => {
  const prefix = venueSearchRank(vivo, "vivo");
  const contains = venueSearchRank(vivoMall, "vivo");
  assert.ok(prefix !== null && contains !== null);
  assert.ok(prefix < contains);
});

test("an exact postal code outranks a postal prefix", () => {
  assert.equal(venueSearchRank(ion, "238801"), 0);
  assert.equal(venueSearchRank(ion, "238"), 1);
});

test("address words match after expanding rd to road", () => {
  assert.equal(venueSearchRank(centrepoint, "orchard rd"), 4);
  assert.equal(venueSearchRank(ion, "orchard road"), null);
});
