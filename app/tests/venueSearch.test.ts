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

test("a single letter does not match the word singapore in an address", () => {
  assert.equal(venueSearchRank(ion, "s"), null);
});

test("a one-digit postal typo is not a match", () => {
  const palais = {
    name: "Palais Renaissance",
    address: "390 ORCHARD ROAD PALAIS RENAISSANCE SINGAPORE 238871",
    postalCode: "238871",
  };
  assert.equal(venueSearchRank(palais, "238801"), null);
  assert.equal(venueSearchRank({ name: "Jewel Changi Airport", address: "78 AIRPORT BOULEVARD", postalCode: undefined }, "jewl"), 5);
});

test("joined name matching only hits the start of the name", () => {
  assert.equal(venueSearchRank({ name: "Vivo City", address: "1 EXAMPLE ROAD", postalCode: undefined }, "vivocity"), 2);
  assert.equal(venueSearchRank({ name: "Sam Kee LRT", address: "Sam Kee LRT Station", postalCode: undefined }, "amk"), null);
});
